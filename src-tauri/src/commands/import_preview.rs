use crate::shared::{extension, extension_set, run_blocking, walk_dirs};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::DirEntry;
use std::path::Path;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewScan {
    total_files: u64,
    supported_files_count: u64,
    supported_files_size: u64,
    unsupported_files_count: u64,
    unsupported_files_size: u64,
    unsupported_extensions: Vec<ExtensionCount>,
    directories_with_supported_files: Vec<String>,
    directories_without_supported_files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionCount {
    extension: String,
    count: u64,
}

#[tauri::command]
pub async fn scan_import_preview(
    directories: Vec<String>,
    supported_extensions: Vec<String>,
) -> Result<ImportPreviewScan, String> {
    run_blocking("Import preview scan", move || {
        scan_roots(directories, supported_extensions)
    })
    .await
}

fn scan_roots(
    directories: Vec<String>,
    supported_extensions: Vec<String>,
) -> Result<ImportPreviewScan, String> {
    let supported = extension_set(supported_extensions);
    let mut scan = ImportPreviewScan::default();
    let mut extensions = HashMap::<String, u64>::new();

    for directory in directories {
        if !Path::new(&directory).is_dir() {
            return Err(format!("Failed to read dir `{directory}`"));
        }

        let supported_before = scan.supported_files_count;
        walk_dirs(Path::new(&directory), &mut |_dir, files| {
            for file in files {
                count_file(&file, &supported, &mut scan, &mut extensions);
            }
            Ok(())
        })?;
        if scan.supported_files_count > supported_before {
            scan.directories_with_supported_files.push(directory);
        } else {
            scan.directories_without_supported_files.push(directory);
        }
    }

    let mut list: Vec<_> = extensions
        .into_iter()
        .map(|(extension, count)| ExtensionCount { extension, count })
        .collect();
    list.sort_by(|a, b| b.count.cmp(&a.count).then(a.extension.cmp(&b.extension)));
    scan.unsupported_extensions = list;
    Ok(scan)
}

/// Adds one file to the running totals, tallying the extensions we cannot import
/// so the dialog can tell the user which formats were skipped.
fn count_file(
    entry: &DirEntry,
    supported: &HashSet<String>,
    scan: &mut ImportPreviewScan,
    extensions: &mut HashMap<String, u64>,
) {
    let ext = extension(&entry.file_name().to_string_lossy());
    let size = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    scan.total_files += 1;

    if supported.contains(&ext) {
        scan.supported_files_count += 1;
        scan.supported_files_size += size;
        return;
    }

    scan.unsupported_files_count += 1;
    scan.unsupported_files_size += size;
    let key = if ext.is_empty() {
        "(no extension)".to_string()
    } else {
        ext
    };
    *extensions.entry(key).or_default() += 1;
}

#[cfg(test)]
#[path = "../tests/import_preview.rs"]
mod tests;
