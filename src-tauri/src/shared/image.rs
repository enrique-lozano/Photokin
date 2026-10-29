use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageReader};

/// Hard ceiling for in-process decoding, meant to stop decompression bombs from
/// aborting the process with an allocator OOM — not ordinary photos, which decode
/// in-process far faster than through the ffmpeg fallback. 256 MiB fits any camera
/// up to ~89 MP in RGB (a 24 MP frame is 72 MiB).
const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;

/// Read dimensions and EXIF orientation without decoding pixel data.
pub fn probe_image(input_path: &str) -> Option<(u32, u32, u8)> {
    let reader = ImageReader::open(input_path)
        .ok()?
        .with_guessed_format()
        .ok()?;
    let mut decoder = reader.into_decoder().ok()?;
    let (width, height) = decoder.dimensions();
    let orientation = decoder
        .orientation()
        .unwrap_or(Orientation::NoTransforms)
        .to_exif();
    Some((width, height, orientation))
}

/// Decode with the `image` crate and bake in EXIF orientation, refusing anything
/// that would decode beyond [`MAX_DECODE_BYTES`]. Formats it cannot handle
/// (HEIC/HEIF/AVIF, ...) return `Err` so callers can fall back to ffmpeg.
pub fn decode_oriented_image(input_path: &str) -> Result<DynamicImage, String> {
    decode_within(input_path, MAX_DECODE_BYTES)
}

fn decode_within(input_path: &str, max_decoded_bytes: u64) -> Result<DynamicImage, String> {
    let reader = ImageReader::open(input_path)
        .map_err(|error| format!("Failed to open `{input_path}`: {error}"))?
        .with_guessed_format()
        .map_err(|error| format!("Failed to detect format of `{input_path}`: {error}"))?;

    let mut decoder = reader
        .into_decoder()
        .map_err(|error| format!("Failed to start decoding `{input_path}`: {error}"))?;

    let total_bytes = decoder.total_bytes();
    if total_bytes > max_decoded_bytes {
        return Err(format!(
            "Image `{input_path}` would decode to {total_bytes} bytes (limit {max_decoded_bytes})"
        ));
    }

    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|error| format!("Failed to decode `{input_path}`: {error}"))?;
    image.apply_orientation(orientation);
    Ok(image)
}

/// Downscale so the longest edge is at most `max_pixels`. Smaller images are unchanged.
pub fn downscale_to_fit(image: DynamicImage, max_pixels: u32) -> DynamicImage {
    if image.width() > max_pixels || image.height() > max_pixels {
        image.thumbnail(max_pixels, max_pixels)
    } else {
        image
    }
}

#[cfg(test)]
#[path = "../tests/image.rs"]
mod tests;
