use crate::shared::run_blocking;
use serde::Serialize;
use std::convert::TryFrom;
use std::fs;
use std::io;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Stable, rename-proof identity for a file on disk: the inode number on Unix
/// and the file index on Windows. Returned as a string because the value can
/// exceed JavaScript's safe integer range. `None` when the platform/filesystem
/// does not expose it.
#[cfg(unix)]
pub(crate) fn file_identity(path: &Path) -> Option<String> {
    use std::os::unix::fs::MetadataExt;
    fs::metadata(path)
        .ok()
        .map(|metadata| metadata.ino().to_string())
}

#[cfg(windows)]
pub(crate) fn file_identity(path: &Path) -> Option<String> {
    // `std::os::windows::fs::MetadataExt::file_index` is still nightly-only, so
    // we read the file index ourselves via the Win32 API (no extra crates).
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use win32_imports::*;

    let path_wide: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let handle = CreateFileW(
            path_wide.as_ptr(),
            0,   // dwDesiredAccess — 0 is enough to query metadata
            0x7, // FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
            core::ptr::null_mut(),
            3,           // OPEN_EXISTING
            0x0200_0000, // FILE_FLAG_BACKUP_SEMANTICS (required for directories)
            core::ptr::null_mut(),
        );

        if handle == INVALID_HANDLE_VALUE {
            return None;
        }

        let mut info = core::mem::zeroed::<BY_HANDLE_FILE_INFORMATION>();
        let ok = GetFileInformationByHandle(handle, &mut info);
        CloseHandle(handle);

        if ok == 0 {
            return None;
        }

        let file_index = ((info.nFileIndexHigh as u64) << 32) | (info.nFileIndexLow as u64);
        Some(file_index.to_string())
    }
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn file_identity(_path: &Path) -> Option<String> {
    None
}

/// Converts a filesystem timestamp into UNIX epoch milliseconds, treating any
/// failure (unsupported platform, out-of-range value) as `None`.
pub(crate) fn system_time_millis(time: io::Result<SystemTime>) -> Option<u64> {
    time.ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

/// Timestamps and the file identity are optional: a platform or filesystem that
/// does not expose them yields `null` rather than failing the whole call.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    mtime: Option<u64>,
    ctime: Option<u64>,
    is_file: bool,
    is_dir: bool,
    size: u64,
    inode: Option<String>,
}

/// A directory child: its name plus the same stat fields, flattened into one
/// object so the frontend reads `name` alongside `size` and `mtime`.
#[derive(Serialize)]
pub struct DirEntryStat {
    name: String,
    #[serde(flatten)]
    stat: FileStat,
}

fn stat_of(path: &Path, metadata: &fs::Metadata) -> FileStat {
    FileStat {
        mtime: system_time_millis(metadata.modified()),
        ctime: system_time_millis(metadata.created()),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        inode: file_identity(path),
    }
}

#[tauri::command]
pub async fn filestat(filename: String) -> Result<FileStat, String> {
    run_blocking("File stat", move || {
        let path = Path::new(&filename);
        let metadata = fs::metadata(path)
            .map_err(|error| format!("Failed to stat file/dir `{filename}`: {error}"))?;

        Ok(stat_of(path, &metadata))
    })
    .await
}

/// Lists the direct children of a directory together with the metadata the
/// library sync needs (modification time, size and stable file identity), in a
/// single native pass. Doing this in Rust avoids one IPC round-trip per file and
/// — importantly on Windows — reads the file index reliably (it is not available
/// from a directory entry's metadata on stable Rust).
#[tauri::command]
pub async fn dir_entries_stat(dir: String) -> Result<Vec<DirEntryStat>, String> {
    run_blocking("Directory stat", move || {
        let read_dir =
            fs::read_dir(&dir).map_err(|error| format!("Failed to read dir `{dir}`: {error}"))?;

        let mut entries = Vec::new();

        for entry in read_dir.flatten() {
            let path = entry.path();

            // Skip entries we cannot stat (e.g. broken symlinks, permission issues)
            // rather than failing the whole listing.
            let Ok(metadata) = fs::metadata(&path) else {
                continue;
            };

            entries.push(DirEntryStat {
                name: entry.file_name().to_string_lossy().into_owned(),
                stat: stat_of(&path, &metadata),
            });
        }

        Ok(entries)
    })
    .await
}

#[cfg(windows)]
mod win32_imports {
    #![allow(non_camel_case_types, non_snake_case, unused)]

    pub type HANDLE = isize;

    #[repr(C)]
    pub struct FILETIME {
        pub dwLowDateTime: u32,
        pub dwHighDateTime: u32,
    }

    #[repr(C)]
    pub struct BY_HANDLE_FILE_INFORMATION {
        pub dwFileAttributes: u32,
        pub ftCreationTime: FILETIME,
        pub ftLastAccessTime: FILETIME,
        pub ftLastWriteTime: FILETIME,
        pub dwVolumeSerialNumber: u32,
        pub nFileSizeHigh: u32,
        pub nFileSizeLow: u32,
        pub nNumberOfLinks: u32,
        pub nFileIndexHigh: u32,
        pub nFileIndexLow: u32,
    }

    pub const INVALID_HANDLE_VALUE: HANDLE = -1isize;

    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateFileW(
            lpFileName: *const u16,
            dwDesiredAccess: u32,
            dwShareMode: u32,
            lpSecurityAttributes: *mut core::ffi::c_void,
            dwCreationDisposition: u32,
            dwFlagsAndAttributes: u32,
            hTemplateFile: *mut core::ffi::c_void,
        ) -> HANDLE;

        pub fn GetFileInformationByHandle(
            hFile: HANDLE,
            lpFileInformation: *mut BY_HANDLE_FILE_INFORMATION,
        ) -> i32;

        pub fn CloseHandle(hObject: HANDLE) -> i32;
    }
}

#[cfg(test)]
#[path = "../tests/file_info.rs"]
mod tests;
