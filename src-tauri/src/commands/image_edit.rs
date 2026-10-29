use crate::shared::{decode_oriented_image, downscale_to_fit, run_blocking};
use image::{imageops::FilterType, DynamicImage, ImageDecoder, ImageEncoder, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::SystemTime;

static NEXT_EDIT: AtomicU64 = AtomicU64::new(0);
const EDIT_PREVIEW_EDGE: u32 = 1600;
static EDIT_PREVIEW: Mutex<Option<EditPreviewCache>> = Mutex::new(None);

struct EditPreviewCache {
    source: String,
    modified: SystemTime,
    len: u64,
    image: DynamicImage,
    profile: Vec<u8>,
    paths: Vec<PathBuf>,
}

impl EditPreviewCache {
    fn clear_files(&mut self) -> Result<(), String> {
        while let Some(path) = self.paths.last() {
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            }
            self.paths.pop();
        }
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditPreview {
    preview_path: String,
    bytes: u64,
    profile_bytes: u64,
    width: u32,
    height: u32,
}

fn encode_preview(
    image: &DynamicImage,
    format: String,
    quality: u8,
    profile: &[u8],
) -> Result<(Vec<u8>, u64), String> {
    if !(1..=100).contains(&quality) {
        return Err("Invalid photo quality".into());
    }
    let edit = ImageEdit {
        turns: 0,
        flip_horizontal: false,
        flip_vertical: false,
        crop: [0.0, 0.0, 1.0, 1.0],
        width: image.width(),
        height: image.height(),
        format,
        quality,
    };
    let encoded = encode(image, &edit)?;
    let bytes = encoded.len() as u64;
    // Display the encoded pixels in a PNG carrying the source profile, including for lossy WebP.
    let decoded = image::load_from_memory(&encoded).map_err(|error| error.to_string())?;
    let mut display = Vec::new();
    let mut encoder = image::codecs::png::PngEncoder::new(&mut display);
    if !profile.is_empty() {
        encoder
            .set_icc_profile(profile.to_vec())
            .map_err(|error| error.to_string())?;
    }
    encoder
        .write_image(
            decoded.as_bytes(),
            decoded.width(),
            decoded.height(),
            decoded.color().into(),
        )
        .map_err(|error| error.to_string())?;
    Ok((display, bytes))
}

#[tauri::command]
pub async fn preview_image_edit(
    source_path: String,
    format: String,
    quality: u8,
) -> Result<EditPreview, String> {
    run_blocking("Preview photo quality", move || {
        let metadata = std::fs::metadata(&source_path).map_err(|error| error.to_string())?;
        let modified = metadata.modified().map_err(|error| error.to_string())?;
        let mut cache = EDIT_PREVIEW.lock().map_err(|error| error.to_string())?;
        let reusable = cache.as_ref().is_some_and(|current| {
            current.source == source_path
                && current.modified == modified
                && current.len == metadata.len()
        });
        if !reusable {
            if let Some(current) = cache.as_mut() {
                current.clear_files()?;
            }
            let image = downscale_to_fit(decode_oriented_image(&source_path)?, EDIT_PREVIEW_EDGE);
            let mut decoder = ImageReader::open(&source_path)
                .map_err(|error| error.to_string())?
                .with_guessed_format()
                .map_err(|error| error.to_string())?
                .into_decoder()
                .map_err(|error| error.to_string())?;
            let profile = decoder
                .icc_profile()
                .map_err(|error| error.to_string())?
                .unwrap_or_default();
            *cache = Some(EditPreviewCache {
                source: source_path,
                modified,
                len: metadata.len(),
                image,
                profile,
                paths: Vec::new(),
            });
        }
        let current = cache.as_mut().ok_or("Photo preview cache is unavailable")?;
        let (display, bytes) = encode_preview(&current.image, format, quality, &current.profile)?;
        let sequence = NEXT_EDIT.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "photokin-editor-preview-{}-{sequence}.png",
            std::process::id()
        ));
        current.paths.push(path.clone());
        std::fs::write(&path, display).map_err(|error| error.to_string())?;
        // Retain the displayed image and its replacement, not every slider position.
        while current.paths.len() > 2 {
            std::fs::remove_file(&current.paths[0]).map_err(|error| error.to_string())?;
            current.paths.remove(0);
        }
        Ok(EditPreview {
            preview_path: path.to_string_lossy().into_owned(),
            bytes,
            profile_bytes: current.profile.len() as u64,
            width: current.image.width(),
            height: current.image.height(),
        })
    })
    .await
}

#[tauri::command]
pub async fn clear_image_edit_preview() -> Result<(), String> {
    run_blocking("Clear photo preview", || {
        let mut cache = EDIT_PREVIEW.lock().map_err(|error| error.to_string())?;
        if let Some(current) = cache.as_mut() {
            current.clear_files()?;
        }
        *cache = None;
        Ok(())
    })
    .await
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEdit {
    pub turns: u8,
    pub flip_horizontal: bool,
    pub flip_vertical: bool,
    pub crop: [f64; 4],
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub quality: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedEdit {
    temp_path: String,
    source_hash: String,
    bytes: u64,
    width: u32,
    height: u32,
}

fn fingerprint(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn transform(mut image: DynamicImage, edit: &ImageEdit) -> Result<DynamicImage, String> {
    if edit.turns > 3 || !(1..=100).contains(&edit.quality) {
        return Err("Invalid rotation or quality".into());
    }
    image = match edit.turns {
        1 => image.rotate90(),
        2 => image.rotate180(),
        3 => image.rotate270(),
        _ => image,
    };
    if edit.flip_horizontal {
        image = image.fliph();
    }
    if edit.flip_vertical {
        image = image.flipv();
    }
    let [left, top, width, height] = edit.crop;
    if edit.crop.iter().any(|value| !value.is_finite())
        || left < 0.0
        || top < 0.0
        || width <= 0.0
        || height <= 0.0
        || left + width > 1.0000001
        || top + height > 1.0000001
    {
        return Err("Crop is outside the photo".into());
    }
    let full_width = image.width();
    let full_height = image.height();
    let crop_left = (left * full_width as f64).round() as u32;
    let crop_top = (top * full_height as f64).round() as u32;
    let crop_right = ((left + width) * full_width as f64).round() as u32;
    let crop_bottom = ((top + height) * full_height as f64).round() as u32;
    let crop_width = crop_right.min(full_width).saturating_sub(crop_left);
    let crop_height = crop_bottom.min(full_height).saturating_sub(crop_top);
    if edit.width == 0 || edit.height == 0 || edit.width > crop_width || edit.height > crop_height {
        return Err("Output must fit within the crop; upscaling is disabled".into());
    }
    image = image.crop_imm(crop_left, crop_top, crop_width, crop_height);
    if image.width() != edit.width || image.height() != edit.height {
        image = image.resize_exact(edit.width, edit.height, FilterType::Lanczos3);
    }
    Ok(image)
}

fn encode(image: &DynamicImage, edit: &ImageEdit) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    if image.color().bits_per_pixel() / image.color().channel_count() as u16 > 8
        && edit.format != "png"
    {
        return Err("Choose PNG to preserve this photo's high bit depth".into());
    }
    match edit.format.as_str() {
        "jpg" => {
            if image.color().has_alpha() {
                return Err("Choose PNG or WebP to preserve transparency".into());
            }
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, edit.quality)
                .encode_image(image)
                .map_err(|error| error.to_string())?;
        }
        "png" => image::codecs::png::PngEncoder::new(&mut output)
            .write_image(
                image.as_bytes(),
                image.width(),
                image.height(),
                image.color().into(),
            )
            .map_err(|error| error.to_string())?,
        "webp" => {
            let rgba = image.to_rgba8();
            output.extend_from_slice(
                &webp::Encoder::from_rgba(rgba.as_raw(), image.width(), image.height())
                    .encode(edit.quality as f32),
            );
        }
        _ => return Err("Unsupported output format".into()),
    }
    Ok(output)
}

#[tauri::command]
pub async fn prepare_image_edit(
    source_path: String,
    decode_path: Option<String>,
    edit: ImageEdit,
) -> Result<PreparedEdit, String> {
    run_blocking("Edit photo", move || {
        let source = Path::new(&source_path);
        let source_hash = fingerprint(source)?;
        let decoded =
            decode_oriented_image(&source_path).or_else(|error| match decode_path.as_deref() {
                Some(path) => decode_oriented_image(path),
                None => Err(error),
            })?;
        let image = transform(decoded, &edit)?;
        let encoded = encode(&image, &edit)?;
        let parent = source.parent().ok_or("Photo has no parent directory")?;
        let sequence = NEXT_EDIT.fetch_add(1, Ordering::Relaxed);
        let temp = parent.join(format!(
            ".photokin-edit-{}-{sequence}.{}.tmp",
            std::process::id(),
            edit.format
        ));
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|error| error.to_string())?;
        if let Err(error) = file.write_all(&encoded).and_then(|_| file.sync_all()) {
            let _ = std::fs::remove_file(&temp);
            return Err(error.to_string());
        }
        Ok(PreparedEdit {
            temp_path: temp.to_string_lossy().into_owned(),
            source_hash,
            bytes: encoded.len() as u64,
            width: image.width(),
            height: image.height(),
        })
    })
    .await
}

fn checked_temp(source: &Path, temp: &Path) -> Result<PathBuf, String> {
    if source.parent() != temp.parent()
        || !temp
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(".photokin-edit-"))
    {
        return Err("Invalid edit temporary file".into());
    }
    Ok(temp.to_path_buf())
}

#[tauri::command]
pub async fn discard_image_edit(source_path: String, temp_path: String) -> Result<(), String> {
    let temp = checked_temp(Path::new(&source_path), Path::new(&temp_path))?;
    std::fs::remove_file(temp).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn commit_image_edit(
    source_path: String,
    temp_path: String,
    destination: String,
    source_hash: String,
) -> Result<(), String> {
    run_blocking("Save photo", move || {
        let source = Path::new(&source_path);
        let temp = checked_temp(source, Path::new(&temp_path))?;
        if fingerprint(source)? != source_hash {
            return Err(
                "The original changed while editing. Reopen the editor before saving.".into(),
            );
        }
        std::fs::OpenOptions::new()
            .write(true)
            .open(&temp)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        if source == Path::new(&destination) {
            let permissions = std::fs::metadata(source)
                .map_err(|error| error.to_string())?
                .permissions();
            if permissions.readonly() {
                return Err("The original is read-only. Save an edited copy instead.".into());
            }
            std::fs::set_permissions(&temp, permissions).map_err(|error| error.to_string())?;
            std::fs::rename(&temp, &destination).map_err(|error| error.to_string())?;
        } else {
            std::fs::hard_link(&temp, &destination).map_err(|error| error.to_string())?;
            let _ = std::fs::remove_file(&temp);
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
#[path = "../tests/image_edit.rs"]
mod tests;
