use crate::shared::run_blocking;
use serde::Serialize;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::{env, fs, io};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

const VERSION_URL: &str = "https://exiftool.org/ver.txt";
// exiftool.org no longer hosts the zips; SourceForge does.
const DOWNLOAD_URL: &str = "https://downloads.sourceforge.net/project/exiftool";
const INSTALL_DIR: &str = "exiftool";
const SAVED_DIR_FILE: &str = "exiftool-dir.txt";

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
    app.path().app_local_data_dir().map_err(|error| error.to_string())
}

fn prepend_to_path(dir: &Path) {
    let current = env::var_os("PATH").unwrap_or_default();
    let paths = std::iter::once(dir.to_path_buf()).chain(env::split_paths(&current));
    if let Ok(joined) = env::join_paths(paths) {
        env::set_var("PATH", joined);
    }
}

/// Saves the folder so it is put on PATH again at every launch.
fn remember_dir(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let data = data_dir(app)?;
    fs::create_dir_all(&data).map_err(|error| format!("Failed to create `{}`: {error}", data.display()))?;
    fs::write(data.join(SAVED_DIR_FILE), dir.to_string_lossy().as_bytes())
        .map_err(|error| format!("Failed to save the ExifTool location: {error}"))?;
    prepend_to_path(dir);
    Ok(())
}

pub fn apply_saved_exiftool_dir(app: &AppHandle) {
    let Ok(data) = data_dir(app) else { return };
    if let Ok(saved) = fs::read_to_string(data.join(SAVED_DIR_FILE)) {
        let saved = saved.trim();
        if !saved.is_empty() {
            prepend_to_path(Path::new(saved));
        }
    }
}

/// Drops the archive's top-level folder and renames `exiftool(-k).exe` so it resolves as `exiftool` on PATH.
fn install_path(entry: &Path) -> Option<PathBuf> {
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

    if dest.exists() {
        fs::remove_dir_all(dest).map_err(|error| format!("Failed to replace `{}`: {error}", dest.display()))?;
    }

    let count = archive.len();
    let mut last_percent = 0;
    on_progress(0)?;
    for index in 0..count {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let Some(relative) = entry.enclosed_name().and_then(|name| install_path(&name)) else {
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
        let percent = total.map(|total| ((bytes.len() as u128 * 100 / total as u128).min(99)) as u8);
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
    on_progress: &Channel<ExiftoolInstallProgress>,
) -> Result<(), String> {
    let report = |stage, version: Option<&str>, percent| {
        on_progress
            .send(ExiftoolInstallProgress {
                stage,
                version: version.map(str::to_string),
                percent,
            })
            .map_err(|error| format!("Could not report ExifTool installation progress: {error}"))
    };
    report(ExiftoolInstallStage::Downloading, None, None)?;
    let agent = ureq::AgentBuilder::new().build();

    let version = agent
        .get(VERSION_URL)
        .call()
        .and_then(|response| response.into_string().map_err(Into::into))
        .map_err(|error| format!("Could not look up the latest ExifTool version: {error}"))?;
    let version = version.trim();
    if version.is_empty() || !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return Err(format!("Unexpected ExifTool version `{version}`"));
    }

    let response = agent
        .get(&format!("{DOWNLOAD_URL}/exiftool-{version}_64.zip"))
        .call()
        .map_err(|error| format!("Could not download ExifTool: {error}"))?;
    let total = response.header("Content-Length").and_then(|value| value.parse().ok());
    let bytes = download_bytes(response.into_reader(), total, |percent| {
        report(ExiftoolInstallStage::Downloading, Some(version), percent)
    })?;

    extract(bytes, dest, |percent| {
        report(ExiftoolInstallStage::Unpacking, Some(version), Some(percent))
    })?;
    report(ExiftoolInstallStage::Checking, Some(version), None)?;
    let output = std::process::Command::new(dest.join("exiftool.exe"))
        .arg("-ver")
        .output()
        .map_err(|error| format!("Could not check the installed ExifTool: {error}"))?;
    if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != version {
        return Err("The installed ExifTool did not pass its version check. Please try again.".to_string());
    }
    Ok(())
}

/// Windows only: streams installation progress and verifies ExifTool before saving its location.
#[tauri::command]
pub async fn install_exiftool(
    app: AppHandle,
    on_progress: Channel<ExiftoolInstallProgress>,
) -> Result<(), String> {
    let dest = data_dir(&app)?.join(INSTALL_DIR);
    let target = dest.clone();
    run_blocking("ExifTool install", move || download_and_extract(&target, &on_progress)).await?;
    remember_dir(&app, &dest)
}

#[tauri::command]
pub fn set_exiftool_location(app: AppHandle, exe_path: String) -> Result<(), String> {
    let path = PathBuf::from(exe_path);
    let is_exiftool = path.file_stem().is_some_and(|stem| stem.eq_ignore_ascii_case("exiftool"));
    let dir = path.parent().filter(|_| is_exiftool);
    let Some(dir) = dir else {
        return Err("Select the ExifTool program (exiftool.exe).".to_string());
    };

    let runs = std::process::Command::new(&path)
        .arg("-ver")
        .output()
        .is_ok_and(|output| output.status.success());
    if !runs {
        return Err("That file did not run as ExifTool.".to_string());
    }
    remember_dir(&app, dir)
}

#[cfg(test)]
#[path = "../tests/exiftool_setup.rs"]
mod tests;
