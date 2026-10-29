use crate::shared::run_blocking;
use fs4::available_space;
use std::path::Path;

#[tauri::command]
pub async fn available_disk_space(path: String) -> Result<u64, String> {
    run_blocking("Disk space", move || {
        let existing = nearest_existing(Path::new(&path))
            .ok_or_else(|| format!("No existing path found for `{path}`"))?;
        available_space(existing)
            .map_err(|error| format!("Failed to read available space for `{path}`: {error}"))
    })
    .await
}

fn nearest_existing(mut current: &Path) -> Option<&Path> {
    loop {
        if current.exists() {
            return Some(current);
        }
        current = current.parent()?;
    }
}

#[cfg(test)]
#[path = "../tests/disk_space.rs"]
mod tests;
