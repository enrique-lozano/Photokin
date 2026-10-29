use crate::shared::{decode_oriented_image, run_blocking};
use image::imageops::FilterType;
use image::DynamicImage;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};

const DHASH_WIDTH: u32 = 9;
const DHASH_HEIGHT: u32 = 8;
const HASH_READ_BUFFER: usize = 1 << 16;
const PREFIX_HASH_BYTES: u64 = 4096;

pub(crate) fn dhash(image: &DynamicImage) -> String {
    let small = image
        .resize_exact(DHASH_WIDTH, DHASH_HEIGHT, FilterType::Triangle)
        .to_luma8();

    let mut hash: u64 = 0;
    let mut bit: u32 = 0;
    for y in 0..DHASH_HEIGHT {
        for x in 0..(DHASH_WIDTH - 1) {
            if small.get_pixel(x, y)[0] < small.get_pixel(x + 1, y)[0] {
                hash |= 1u64 << bit;
            }
            bit += 1;
        }
    }
    hash.to_string()
}

#[tauri::command]
pub async fn perceptual_hash(image_path: String) -> Result<String, String> {
    run_blocking("Perceptual hash", move || {
        Ok(dhash(&decode_oriented_image(&image_path)?))
    })
    .await
}

#[tauri::command]
pub async fn sha256_file(path: String) -> Result<String, String> {
    run_blocking("SHA-256", move || sha256_path(&path)).await
}

/// Cheap pre-filter for exact matching: hashes only the first bytes of a file.
/// Files of equal size whose prefixes differ cannot be identical, so they skip
/// the full read.
#[tauri::command]
pub async fn sha256_file_prefix(path: String) -> Result<String, String> {
    run_blocking("SHA-256 prefix", move || sha256_reader(&path, Some(PREFIX_HASH_BYTES))).await
}

fn sha256_path(path: &str) -> Result<String, String> {
    sha256_reader(path, None)
}

fn sha256_reader(path: &str, limit: Option<u64>) -> Result<String, String> {
    let file = File::open(path).map_err(|error| format!("Failed to open `{path}`: {error}"))?;
    let mut reader = BufReader::new(file.take(limit.unwrap_or(u64::MAX)));
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; HASH_READ_BUFFER];

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read `{path}`: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
#[path = "../tests/hashing.rs"]
mod tests;
