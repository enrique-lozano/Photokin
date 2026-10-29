use crate::commands::file_info::{file_identity, system_time_millis};
use crate::shared::{extension, extension_set, probe_image, probe_video, run_blocking, walk_dirs};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::ipc::Channel;

const DISCOVERY_CHUNK_SIZE: usize = 16;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFile {
    absolute_path: String,
    relative_dir: String,
    filename: String,
    mtime: Option<u64>,
    ctime: Option<u64>,
    directory_mtime: Option<u64>,
    size: u64,
    inode: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    orientation: u8,
}

#[derive(Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum ImportDiscoveryEvent {
    Chunk {
        files: Vec<DiscoveredFile>,
        discovered: u64,
    },
    Finished {
        discovered: u64,
    },
}

#[tauri::command]
pub async fn discover_import_files(
    root: String,
    supported_extensions: Vec<String>,
    on_event: Channel<ImportDiscoveryEvent>,
) -> Result<u64, String> {
    run_blocking("Import discovery", move || {
        discover(&root, supported_extensions, &on_event)
    })
    .await
}

fn discover(
    root: &str,
    supported_extensions: Vec<String>,
    on_event: &Channel<ImportDiscoveryEvent>,
) -> Result<u64, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Failed to read dir `{root}`"));
    }

    let supported = extension_set(supported_extensions);
    let mut chunk = Vec::with_capacity(DISCOVERY_CHUNK_SIZE);
    let mut discovered = 0;

    walk_dirs(root_path, &mut |dir, files| {
        let directory_mtime = fs::metadata(dir)
            .ok()
            .and_then(|metadata| system_time_millis(metadata.modified()));
        let relative_dir = relative_dir(root_path, dir);

        for entry in files {
            let path = entry.path();
            let Ok(metadata) = fs::metadata(&path) else {
                continue;
            };
            let file_extension = extension(&entry.file_name().to_string_lossy());
            if !supported.contains(&file_extension) {
                continue;
            }

            let geometry = if file_extension == ".mp4" {
                probe_video(&path, metadata.len())
            } else {
                probe_image(path.to_string_lossy().as_ref())
            };
            let (width, height, orientation) = geometry
                .map(|(width, height, orientation)| (Some(width), Some(height), orientation))
                .unwrap_or((None, None, 1));
            chunk.push(DiscoveredFile {
                absolute_path: path.to_string_lossy().into_owned(),
                relative_dir: relative_dir.clone(),
                filename: entry.file_name().to_string_lossy().into_owned(),
                mtime: system_time_millis(metadata.modified()),
                ctime: system_time_millis(metadata.created()),
                directory_mtime,
                size: metadata.len(),
                inode: file_identity(&path),
                width,
                height,
                orientation,
            });
            discovered += 1;

            if chunk.len() == DISCOVERY_CHUNK_SIZE {
                on_event
                    .send(ImportDiscoveryEvent::Chunk {
                        files: std::mem::take(&mut chunk),
                        discovered,
                    })
                    .map_err(|error| error.to_string())?;
            }
        }

        Ok(())
    })?;

    if !chunk.is_empty() {
        on_event
            .send(ImportDiscoveryEvent::Chunk {
                files: chunk,
                discovered,
            })
            .map_err(|error| error.to_string())?;
    }
    on_event
        .send(ImportDiscoveryEvent::Finished { discovered })
        .map_err(|error| error.to_string())?;
    Ok(discovered)
}

fn relative_dir(root: &Path, dir: &Path) -> String {
    let Ok(relative) = dir.strip_prefix(root) else {
        return "/".to_string();
    };
    let normalized = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    if normalized.is_empty() {
        "/".to_string()
    } else {
        normalized
    }
}

#[cfg(test)]
mod tests {
    use super::{discover, relative_dir};
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use tauri::ipc::{Channel, InvokeResponseBody};

    #[test]
    fn discovery_emits_video_geometry() {
        let messages = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&messages);
        let channel = Channel::new(move |body| {
            if let InvokeResponseBody::Json(json) = body {
                captured.lock().unwrap().push(json);
            }
            Ok(())
        });
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo/images");
        discover(root.to_str().unwrap(), vec![".mp4".into()], &channel).unwrap();
        let events: Vec<serde_json::Value> = messages
            .lock()
            .unwrap()
            .iter()
            .map(|json| serde_json::from_str(json).unwrap())
            .collect();
        let video = events
            .iter()
            .filter_map(|event| event["data"]["files"].as_array())
            .flatten()
            .find(|file| file["filename"] == "bunny.mp4")
            .unwrap();
        assert!(video["width"].as_u64().unwrap() > 1);
        assert!(video["height"].as_u64().unwrap() > 1);
        assert_eq!(video["orientation"], 1);
    }

    #[test]
    fn normalizes_relative_album_paths() {
        assert_eq!(
            relative_dir(Path::new("C:/photos"), Path::new("C:/photos")),
            "/"
        );
        assert_eq!(
            relative_dir(Path::new("C:/photos"), Path::new("C:/photos/trips/2026")),
            "trips/2026"
        );
    }
}
