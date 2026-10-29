use std::collections::HashSet;
use std::fs::{self, DirEntry};
use std::path::Path;

/// Normalizes a file extension to the `.ext` lowercase form the frontend sends.
pub fn extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{}", ext.to_ascii_lowercase()))
        .unwrap_or_default()
}

/// The frontend's extension list as a lookup set, normalized like [`extension`].
pub fn extension_set(extensions: Vec<String>) -> HashSet<String> {
    extensions
        .into_iter()
        .map(|value| value.to_ascii_lowercase())
        .collect()
}

/// Walks `root` depth-first, handing `visit` each directory together with its
/// entries. Directories the OS refuses are skipped rather than failing the walk:
/// one unreadable folder must not abort a whole import.
pub fn walk_dirs<F>(root: &Path, visit: &mut F) -> Result<(), String>
where
    F: FnMut(&Path, Vec<DirEntry>) -> Result<(), String>,
{
    let mut pending = vec![root.to_path_buf()];

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };

        let mut files = Vec::new();
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(entry.path()),
                Ok(kind) if kind.is_file() => files.push(entry),
                _ => {}
            }
        }

        visit(&dir, files)?;
    }

    Ok(())
}

#[cfg(test)]
#[path = "../tests/fs_walk.rs"]
mod tests;
