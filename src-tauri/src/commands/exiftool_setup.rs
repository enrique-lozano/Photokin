use crate::shared::run_blocking;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::{env, fs, io};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

// Update together with the official checksums and the metadata regression tests.
pub const MANAGED_VERSION: &str = "13.60";
// exiftool.org no longer hosts the zips; SourceForge does.
const DOWNLOAD_URL: &str = "https://downloads.sourceforge.net/project/exiftool";
const INSTALL_DIR: &str = "exiftool";
const SAVED_DIR_FILE: &str = "exiftool-dir.txt";
static SETUP_LOCK: Mutex<()> = Mutex::new(());

fn distribution(windows: bool, x86: bool) -> (&'static str, &'static str) {
    if windows && x86 {
        (
            "exiftool-13.60_32.zip",
            "4f8d21d39d96518af4be645e486bab11797269b4da357e08809276886bb098a4",
        )
    } else if windows {
        (
            "exiftool-13.60_64.zip",
            "548b1f4e0b713cd2a26824b34080c35db4e2d2edd166468eb38b1d55ada90c2e",
        )
    } else {
        (
            "Image-ExifTool-13.60.tar.gz",
            "c8e3c42576f46d862e4cd9c192989776e7363931e890c95056bcd6293e83ea36",
        )
    }
}

fn verify_checksum(bytes: &[u8], expected: &str) -> Result<(), String> {
    if format!("{:x}", Sha256::digest(bytes)) != expected {
        return Err("The ExifTool download failed its checksum check. Please try again.".into());
    }
    Ok(())
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExiftoolInstallStage {
    Downloading,
    Unpacking,
    Checking,
}

#[derive(Serialize)]
pub struct ExiftoolInstallProgress {
    stage: ExiftoolInstallStage,
    version: Option<String>,
    percent: Option<u8>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())
}

fn path_with_dir(dir: &Path) -> Result<std::ffi::OsString, String> {
    let current = env::var_os("PATH").unwrap_or_default();
    let paths = std::iter::once(dir.to_path_buf()).chain(env::split_paths(&current));
    env::join_paths(paths).map_err(|error| format!("Could not use the ExifTool folder: {error}"))
}

fn launch_dir(dir: &Path) -> Result<PathBuf, String> {
    #[cfg(windows)]
    if !dir.as_os_str().to_string_lossy().is_ascii() {
        use std::os::windows::ffi::{OsStrExt, OsStringExt};
        use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;
        let input: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
        // The official launcher uses ANSI paths to locate its bundled Perl DLL.
        let needed = unsafe { GetShortPathNameW(input.as_ptr(), std::ptr::null_mut(), 0) };
        let guidance = "Windows ExifTool cannot run from this non-ASCII folder and no usable short path is available. Use Choose file / Locate manually to select ExifTool installed in an ASCII-only folder.";
        if needed == 0 {
            return Err(format!("{guidance} ({})", io::Error::last_os_error()));
        }
        let mut output = vec![0; needed as usize];
        let written = unsafe { GetShortPathNameW(input.as_ptr(), output.as_mut_ptr(), needed) };
        if written == 0 || written >= needed {
            return Err(format!("{guidance} ({})", io::Error::last_os_error()));
        }
        let short = PathBuf::from(std::ffi::OsString::from_wide(&output[..written as usize]));
        if !short.as_os_str().to_string_lossy().is_ascii() {
            return Err(guidance.into());
        }
        return Ok(short);
    }
    Ok(dir.to_path_buf())
}

/// Saves the folder so it is put on PATH again at every launch.
fn remember_dir(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let dir = launch_dir(dir)?;
    let path = path_with_dir(&dir)?;
    let data = data_dir(app)?;
    fs::create_dir_all(&data)
        .map_err(|error| format!("Failed to create `{}`: {error}", data.display()))?;
    save_dir(&data, &dir)?;
    env::set_var("PATH", path);
    Ok(())
}

fn save_dir(data: &Path, dir: &Path) -> Result<(), String> {
    let saved = dir
        .to_str()
        .ok_or("The ExifTool location is not valid UTF-8.")?;
    let temporary = data.join("exiftool-dir.tmp");
    fs::write(&temporary, saved.as_bytes())
        .and_then(|_| fs::rename(&temporary, data.join(SAVED_DIR_FILE)))
        .map_err(|error| format!("Failed to save the ExifTool location: {error}"))
}

pub fn apply_saved_exiftool_dir(app: &AppHandle) -> Result<(), String> {
    let saved = match fs::read_to_string(data_dir(app)?.join(SAVED_DIR_FILE)) {
        Ok(saved) => saved,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not read the ExifTool location: {error}")),
    };
    if !saved.trim().is_empty() {
        env::set_var("PATH", path_with_dir(Path::new(saved.trim()))?);
    }
    Ok(())
}

/// Drops the archive's top-level folder and renames `exiftool(-k).exe` so it resolves as `exiftool` on PATH.
fn install_path(entry: &Path) -> Option<PathBuf> {
    if entry
        .components()
        .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return None;
    }
    let relative: PathBuf = entry.components().skip(1).collect();
    if relative.as_os_str().is_empty() {
        return None;
    }
    if relative == Path::new("exiftool(-k).exe") {
        return Some(PathBuf::from("exiftool.exe"));
    }
    Some(relative)
}

fn extract(
    archive_bytes: Vec<u8>,
    dest: &Path,
    mut on_progress: impl FnMut(u8) -> Result<(), String>,
) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(archive_bytes))
        .map_err(|error| format!("The ExifTool download is not a valid zip: {error}"))?;

    let count = archive.len();
    let mut last_percent = 0;
    on_progress(0)?;
    for index in 0..count {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry
            .enclosed_name()
            .ok_or("The ExifTool archive contains an unsafe path.")?;
        let Some(relative) = install_path(&name) else {
            if name.components().count() > 1 {
                return Err("The ExifTool archive contains an unsafe path.".into());
            }
            continue;
        };
        let target = dest.join(relative);

        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut file = fs::File::create(&target)
            .map_err(|error| format!("Failed to create `{}`: {error}", target.display()))?;
        io::copy(&mut entry, &mut file).map_err(|error| error.to_string())?;
        let percent = ((index + 1) * 100 / count) as u8;
        if percent != last_percent {
            on_progress(percent)?;
            last_percent = percent;
        }
    }
    on_progress(100)?;
    Ok(())
}

fn extract_perl(
    bytes: Vec<u8>,
    dest: &Path,
    mut on_progress: impl FnMut(u8) -> Result<(), String>,
) -> Result<(), String> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(Cursor::new(bytes)));
    on_progress(0)?;
    for entry in archive
        .entries()
        .map_err(|error| format!("Invalid ExifTool archive: {error}"))?
    {
        let mut entry = entry.map_err(|error| error.to_string())?;
        let path = entry
            .path()
            .map_err(|error| error.to_string())?
            .into_owned();
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            return Err("The ExifTool archive contains an unsupported entry.".into());
        }
        let Some(relative) = install_path(&path) else {
            if path.components().count() > 1 {
                return Err("The ExifTool archive contains an unsafe path.".into());
            }
            continue;
        };
        let target = dest.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        entry
            .unpack(target)
            .map_err(|error| format!("Could not unpack ExifTool: {error}"))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(dest.join("exiftool"), fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("Could not make ExifTool executable: {error}"))?;
    }
    on_progress(100)
}

fn require_perl() -> Result<(), String> {
    if cfg!(target_os = "windows") {
        return Ok(());
    }
    let output = std::process::Command::new("perl")
        .args(["-e", "exit($] >= 5.008 ? 0 : 1)"])
        .output()
        .map_err(|_| "ExifTool needs Perl 5.8 or newer. Install Perl with your system package manager, then try again.".to_string())?;
    if !output.status.success() {
        return Err("ExifTool needs Perl 5.8 or newer. Update Perl, then try again.".into());
    }
    Ok(())
}

fn verify_installation(dest: &Path) -> Result<(), String> {
    let dest = launch_dir(dest)?;
    let executable = dest.join(if cfg!(target_os = "windows") {
        "exiftool.exe"
    } else {
        "exiftool"
    });
    let output = std::process::Command::new(&executable)
        .arg("-ver")
        .output()
        .map_err(|error| format!("Could not check the installed ExifTool: {error}"))?;
    if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != MANAGED_VERSION
    {
        return Err(
            "The installed ExifTool did not pass its version check. Please try again.".into(),
        );
    }
    let fixture = dest.join("photokin-setup-check.png");
    let result = (|| {
        image::RgbImage::new(1, 1)
            .save(&fixture)
            .map_err(|error| error.to_string())?;
        let write = std::process::Command::new(&executable)
            .args([
                "-charset",
                "filename=UTF8",
                "-overwrite_original",
                "-XMP-dc:Title=Photokin setup check",
            ])
            .arg(&fixture)
            .output()
            .map_err(|error| error.to_string())?;
        if !write.status.success() || !write.stderr.is_empty() {
            return Err("ExifTool did not pass its metadata write check.".into());
        }
        let read = std::process::Command::new(&executable)
            .args(["-charset", "filename=UTF8", "-s3", "-XMP-dc:Title"])
            .arg(&fixture)
            .output()
            .map_err(|error| error.to_string())?;
        if !read.status.success()
            || !read.stderr.is_empty()
            || String::from_utf8_lossy(&read.stdout).trim() != "Photokin setup check"
        {
            return Err("ExifTool did not pass its metadata read check.".into());
        }
        Ok(())
    })();
    fs::remove_file(&fixture)
        .or_else(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                Ok(())
            } else {
                Err(error)
            }
        })
        .map_err(|error| format!("Could not remove the ExifTool test file: {error}"))?;
    result
}

fn download_bytes(
    mut reader: impl Read,
    total: Option<u64>,
    mut on_progress: impl FnMut(Option<u8>) -> Result<(), String>,
) -> Result<Vec<u8>, String> {
    let total = total.filter(|total| *total > 0);
    let mut bytes = Vec::new();
    let mut buffer = [0; 64 * 1024];
    let mut last_percent = total.map(|_| 0);
    on_progress(last_percent)?;
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| format!("Could not download ExifTool: {error}"))?;
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..count]);
        let percent =
            total.map(|total| ((bytes.len() as u128 * 100 / total as u128).min(99)) as u8);
        if percent != last_percent {
            on_progress(percent)?;
            last_percent = percent;
        }
    }
    if total.is_some_and(|total| bytes.len() as u64 != total) {
        return Err("The ExifTool download was incomplete. Please try again.".to_string());
    }
    on_progress(Some(100))?;
    Ok(bytes)
}

fn download_and_extract(
    dest: &Path,
    report: impl Fn(ExiftoolInstallStage, Option<&str>, Option<u8>) -> Result<(), String>,
) -> Result<(), String> {
    report(ExiftoolInstallStage::Downloading, None, None)?;
    require_perl()?;
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(120))
        .build();
    let (archive, checksum) = distribution(cfg!(target_os = "windows"), cfg!(target_arch = "x86"));
    let response = agent
        .get(&format!("{DOWNLOAD_URL}/{archive}"))
        .call()
        .map_err(|error| format!("Could not download ExifTool: {error}"))?;
    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse().ok());
    let bytes = download_bytes(response.into_reader(), total, |percent| {
        report(
            ExiftoolInstallStage::Downloading,
            Some(MANAGED_VERSION),
            percent,
        )
    })?;
    verify_checksum(&bytes, checksum)?;
    let progress = |percent| {
        report(
            ExiftoolInstallStage::Unpacking,
            Some(MANAGED_VERSION),
            Some(percent),
        )
    };
    if cfg!(target_os = "windows") {
        extract(bytes, dest, progress)?;
    } else {
        report(ExiftoolInstallStage::Unpacking, Some(MANAGED_VERSION), None)?;
        extract_perl(bytes, dest, progress)?;
    }
    report(ExiftoolInstallStage::Checking, Some(MANAGED_VERSION), None)?;
    verify_installation(dest)
}

fn install_managed(
    data: &Path,
    install: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<PathBuf, String> {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let root = data.join(INSTALL_DIR);
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let stage = root.join(format!(".install-{unique}"));
    fs::create_dir(&stage).map_err(|error| error.to_string())?;
    let dest = root.join(format!("{MANAGED_VERSION}-{unique}"));
    let result = install(&stage).and_then(|_| {
        fs::rename(&stage, &dest)
            .map_err(|error| format!("Could not activate ExifTool: {error}"))?;
        Ok(dest)
    });
    if result.is_err() {
        fs::remove_dir_all(&stage)
            .map_err(|error| format!("Could not clean up the failed ExifTool install: {error}"))?;
    }
    result
}

/// Streams installation progress and validates a private copy before changing the saved location.
#[tauri::command]
pub async fn install_exiftool(
    app: AppHandle,
    on_progress: Channel<ExiftoolInstallProgress>,
) -> Result<(), String> {
    run_blocking("ExifTool install", move || {
        let _guard = SETUP_LOCK
            .try_lock()
            .map_err(|_| "ExifTool setup is already running. Please wait.".to_string())?;
        let dest = install_managed(&data_dir(&app)?, |target| {
            download_and_extract(target, |stage, version, percent| {
                on_progress
                    .send(ExiftoolInstallProgress {
                        stage,
                        version: version.map(str::to_string),
                        percent,
                    })
                    .map_err(|error| {
                        format!("Could not report ExifTool installation progress: {error}")
                    })
            })
        })?;
        remember_dir(&app, &dest)
    })
    .await
}

#[tauri::command]
pub fn set_exiftool_location(app: AppHandle, exe_path: String) -> Result<(), String> {
    let _guard = SETUP_LOCK
        .try_lock()
        .map_err(|_| "ExifTool setup is already running. Please wait.".to_string())?;
    let path = PathBuf::from(exe_path);
    let expected = if cfg!(target_os = "windows") {
        "exiftool.exe"
    } else {
        "exiftool"
    };
    let is_exiftool = path.is_absolute()
        && path
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case(expected));
    let dir = path.parent().filter(|_| is_exiftool);
    let Some(dir) = dir else {
        return Err(
            "Select the ExifTool program (exiftool.exe on Windows, exiftool on macOS/Linux)."
                .to_string(),
        );
    };

    let executable = launch_dir(dir)?.join(expected);
    let runs = std::process::Command::new(&executable)
        .arg("-ver")
        .output()
        .is_ok_and(|output| {
            let version = String::from_utf8_lossy(&output.stdout);
            output.status.success() && valid_version(version.trim())
        });
    if !runs {
        return Err("That file did not run as ExifTool.".to_string());
    }
    remember_dir(&app, dir)
}

fn valid_version(version: &str) -> bool {
    let Some((major, minor)) = version.split_once('.') else {
        return false;
    };
    !major.is_empty()
        && !minor.is_empty()
        && major.chars().all(|c| c.is_ascii_digit())
        && minor.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
#[path = "../tests/exiftool_setup.rs"]
mod tests;
