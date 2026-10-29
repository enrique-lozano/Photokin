use crate::shared::{decode_oriented_image, downscale_to_fit, run_blocking};
use tauri::image::Image;
use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Cap the clipboard bitmap: a 20+ MP RGBA dump is slow and too large for
/// Windows clipboard history. Only the path crosses IPC.
const CLIPBOARD_MAX_LONGEST_SIDE: u32 = 4096;

#[tauri::command]
pub async fn copy_image_to_clipboard<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    run_blocking("Clipboard copy", move || {
        let image = downscale_to_fit(decode_oriented_image(&path)?, CLIPBOARD_MAX_LONGEST_SIDE);
        let rgba = image.to_rgba8();
        let (width, height) = (rgba.width(), rgba.height());
        app.clipboard()
            .write_image(&Image::new_owned(rgba.into_raw(), width, height))
            .map_err(|error| format!("Failed to write image to clipboard: {error}"))
    })
    .await
}
