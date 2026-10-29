use crate::shared::run_blocking;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

fn in_progress() -> &'static Mutex<HashSet<String>> {
    static IN_PROGRESS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IN_PROGRESS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn cancel_requests() -> &'static Mutex<HashSet<String>> {
    static CANCEL_REQUESTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCEL_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_cancel_requested(model_id: &str) -> bool {
    cancel_requests()
        .lock()
        .map(|guard| guard.contains(model_id))
        .unwrap_or(false)
}

fn clear_cancel_request(model_id: &str) {
    if let Ok(mut guard) = cancel_requests().lock() {
        guard.remove(model_id);
    }
}

/// Overall progress, weighted by bytes when every file size is known up front,
/// otherwise by file count (a few tiny config files would skew it otherwise).
fn overall_fraction(
    done_bytes: u64,
    total_bytes: u64,
    file_index: usize,
    file_count: usize,
    file_fraction: f64,
) -> f64 {
    let fraction = if total_bytes > 0 {
        done_bytes as f64 / total_bytes as f64
    } else {
        (file_index as f64 + file_fraction) / file_count.max(1) as f64
    };
    fraction.clamp(0.0, 1.0)
}

const PROGRESS_EVENT: &str = "smart-search://model-download";
const BUFFER_SIZE: usize = 1 << 20;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelDownloadProgress {
    model_id: String,
    fraction: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadResult {
    status: &'static str,
}

enum DownloadOutcome {
    Completed,
    Cancelled,
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    model_id: String,
    base_url: String,
    files: Vec<String>,
    dest_dir: String,
) -> Result<ModelDownloadResult, String> {
    {
        let mut guard = in_progress().lock().map_err(|error| error.to_string())?;
        if !guard.insert(model_id.clone()) {
            return Ok(ModelDownloadResult {
                status: "alreadyRunning",
            });
        }
    }
    clear_cancel_request(&model_id);

    let cleanup_id = model_id.clone();
    let outcome = run_blocking("Model download", move || {
        run_download(&app, &model_id, &base_url, &files, &dest_dir)
    })
    .await;

    if let Ok(mut guard) = in_progress().lock() {
        guard.remove(&cleanup_id);
    }
    clear_cancel_request(&cleanup_id);

    outcome.map(|outcome| ModelDownloadResult {
        status: match outcome {
            DownloadOutcome::Completed => "completed",
            DownloadOutcome::Cancelled => "cancelled",
        },
    })
}

/// Stops a running download; it then deletes everything it wrote for that
/// model. Returns `false` when no download for `model_id` is running.
#[tauri::command]
pub fn cancel_model_download(model_id: String) -> Result<bool, String> {
    let running = in_progress()
        .lock()
        .map_err(|error| error.to_string())?
        .contains(&model_id);
    if running {
        cancel_requests()
            .lock()
            .map_err(|error| error.to_string())?
            .insert(model_id);
    }
    Ok(running)
}

fn cancel_download(dest_root: &Path) -> Result<DownloadOutcome, String> {
    if dest_root.exists() {
        fs::remove_dir_all(dest_root)
            .map_err(|error| format!("Failed to remove `{}`: {error}", dest_root.display()))?;
    }
    Ok(DownloadOutcome::Cancelled)
}

fn run_download(
    app: &AppHandle,
    model_id: &str,
    base_url: &str,
    files: &[String],
    dest_dir: &str,
) -> Result<DownloadOutcome, String> {
    let file_count = files.len();
    let dest_root = Path::new(dest_dir);
    let agent = ureq::AgentBuilder::new().build();
    let file_url =
        |relative: &str| format!("{base_url}/{model_id}/resolve/main/{relative}?download=true");

    let emit = |fraction: f64| {
        let _ = app.emit(
            PROGRESS_EVENT,
            ModelDownloadProgress {
                model_id: model_id.to_string(),
                fraction,
            },
        );
    };

    let sizes: Vec<Option<u64>> = files
        .iter()
        .map(|relative| match fs::metadata(dest_root.join(relative)) {
            Ok(metadata) => Some(metadata.len()),
            Err(_) => agent
                .head(&file_url(relative))
                .call()
                .ok()
                .and_then(|response| response.header("content-length")?.parse().ok()),
        })
        .collect();
    let total_bytes: u64 = if sizes.iter().all(Option::is_some) {
        sizes.iter().flatten().sum()
    } else {
        0
    };
    let mut done_bytes: u64 = 0;

    for (file_index, relative) in files.iter().enumerate() {
        if is_cancel_requested(model_id) {
            return cancel_download(dest_root);
        }

        let destination = dest_root.join(relative);
        let file_start = done_bytes;
        let report = |received: u64, file_fraction: f64| {
            emit(overall_fraction(
                file_start + received,
                total_bytes,
                file_index,
                file_count,
                file_fraction,
            ));
        };

        if destination.exists() {
            done_bytes += sizes[file_index].unwrap_or(0);
            report(0, 1.0);
            continue;
        }

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create `{}`: {error}", parent.display()))?;
        }

        let response = agent
            .get(&file_url(relative))
            .call()
            .map_err(|error| format!("Failed to download {relative}: {error}"))?;

        let total: u64 = response
            .header("content-length")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);

        let part_path = PathBuf::from(format!("{}.part", destination.to_string_lossy()));
        let mut file = fs::File::create(&part_path)
            .map_err(|error| format!("Failed to create `{}`: {error}", part_path.display()))?;
        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; BUFFER_SIZE];
        let mut received: u64 = 0;
        let mut last_emit = Instant::now();

        loop {
            if is_cancel_requested(model_id) {
                drop(file);
                return cancel_download(dest_root);
            }
            let read = reader
                .read(&mut buffer)
                .map_err(|error| format!("Failed while downloading {relative}: {error}"))?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read])
                .map_err(|error| format!("Failed to write `{}`: {error}", part_path.display()))?;
            received += read as u64;

            if total > 0 && last_emit.elapsed().as_millis() >= 150 {
                report(received, received as f64 / total as f64);
                last_emit = Instant::now();
            }
        }

        file.flush()
            .map_err(|error| format!("Failed to flush `{}`: {error}", part_path.display()))?;
        drop(file);
        fs::rename(&part_path, &destination)
            .map_err(|error| format!("Failed to finalize `{}`: {error}", destination.display()))?;
        done_bytes += received;
        report(received, 1.0);
    }

    emit(1.0);
    Ok(DownloadOutcome::Completed)
}

#[cfg(test)]
#[path = "../tests/model_download.rs"]
mod tests;
