use crate::commands::hashing::dhash;
use crate::shared::{decode_oriented_image, downscale_to_fit, run_blocking};
use std::path::{Path, PathBuf};
use webp::{Encoder, WebPMemory};

const DEFAULT_WEBP_QUALITY: f32 = 85.0;

#[tauri::command]
pub async fn generate_image_thumbnail(
    input_path: String,
    output_path: String,
    max_pixels: u32,
    quality: Option<u8>,
) -> Result<String, String> {
    let quality = quality.map(|q| q as f32).unwrap_or(DEFAULT_WEBP_QUALITY);
    run_blocking("Thumbnail", move || {
        let source = decode_oriented_image(&input_path)?;
        let perceptual_hash = dhash(&source);
        let image = downscale_to_fit(source, max_pixels);
        write_webp(&output_path, &encode_webp(&image, Some(quality)))?;
        Ok(perceptual_hash)
    })
    .await
}

#[tauri::command]
pub async fn generate_image_preview(input_path: String, output_path: String) -> Result<(), String> {
    run_blocking("Preview", move || {
        let image = decode_oriented_image(&input_path)?;
        write_webp(&output_path, &encode_webp(&image, None))
    })
    .await
}

/// Cache layout (must match `src/media/thumbnails/thumbnail.ts` and `preview.ts`):
/// `{dir}/{id[0..2]}/{id}.webp`, `XS__{id}.webp`, `{dir}/PREVIEW__{id}.webp`.
#[tauri::command]
pub async fn delete_asset_image_caches(
    thumbnails_dir: String,
    asset_ids: Vec<String>,
) -> Result<(), String> {
    if asset_ids.is_empty() {
        return Ok(());
    }

    run_blocking("Cache cleanup", move || {
        let base = PathBuf::from(thumbnails_dir);
        for id in asset_ids {
            if !id.is_empty() {
                for path in cache_files(&base, &id) {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        Ok(())
    })
    .await
}

fn cache_files(base: &Path, id: &str) -> [PathBuf; 3] {
    let shard_dir = base.join(&id[..id.len().min(2)]);
    [
        shard_dir.join(format!("{id}.webp")),
        shard_dir.join(format!("XS__{id}.webp")),
        base.join(format!("PREVIEW__{id}.webp")),
    ]
}

fn encode_webp(image: &image::DynamicImage, quality: Option<f32>) -> WebPMemory {
    let (width, height) = (image.width(), image.height());
    let encode = |encoder: Encoder| match quality {
        Some(q) => encoder.encode(q),
        None => encoder.encode_lossless(),
    };

    if image.color().has_alpha() {
        let rgba = image.to_rgba8();
        encode(Encoder::from_rgba(rgba.as_raw(), width, height))
    } else {
        let rgb = image.to_rgb8();
        encode(Encoder::from_rgb(rgb.as_raw(), width, height))
    }
}

fn write_webp(output_path: &str, webp: &[u8]) -> Result<(), String> {
    if webp.is_empty() {
        return Err(format!(
            "WebP encoding produced no data for `{output_path}`"
        ));
    }
    if let Some(parent) = Path::new(output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create output directory: {error}"))?;
    }
    std::fs::write(output_path, webp)
        .map_err(|error| format!("Failed to write `{output_path}`: {error}"))
}

#[cfg(test)]
#[path = "../tests/thumbnail.rs"]
mod tests;
