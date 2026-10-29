use super::*;
use image::{GrayImage, Luma};
use std::fs;

/// A left-to-right (or mirrored) luma ramp: every column differs from the next,
/// which is exactly what dhash compares.
fn gradient(size: u32, mirrored: bool) -> DynamicImage {
    let mut image = GrayImage::new(size, size);
    for (x, _y, pixel) in image.enumerate_pixels_mut() {
        let level = (x * 255 / (size - 1)) as u8;
        *pixel = Luma([if mirrored { 255 - level } else { level }]);
    }
    DynamicImage::ImageLuma8(image)
}

#[test]
fn dhash_sets_one_bit_per_brighter_neighbour() {
    // 8 rows x 8 comparisons fill the 64 bits, and on a rising ramp every one holds.
    assert_eq!(dhash(&gradient(64, false)), u64::MAX.to_string());
    // Mirrored, no comparison holds.
    assert_eq!(dhash(&gradient(64, true)), "0");
    // A flat image has no brighter neighbour either.
    assert_eq!(dhash(&DynamicImage::new_luma8(32, 32)), "0");
}

#[test]
fn dhash_ignores_resolution() {
    assert_eq!(dhash(&gradient(512, false)), dhash(&gradient(64, false)));
}

#[test]
fn sha256_path_matches_known_digest() {
    let path = std::env::temp_dir().join(format!("photokin-sha256-{}", std::process::id()));
    fs::write(&path, b"abc").unwrap();
    let digest = sha256_path(path.to_str().unwrap()).unwrap();
    let _ = fs::remove_file(&path);
    assert_eq!(digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}

#[test]
fn sha256_prefix_ignores_bytes_past_the_limit() {
    let dir = std::env::temp_dir();
    let a = dir.join(format!("photokin-prefix-a-{}", std::process::id()));
    let b = dir.join(format!("photokin-prefix-b-{}", std::process::id()));
    let head = vec![7u8; PREFIX_HASH_BYTES as usize];
    fs::write(&a, [head.clone(), b"tail-a".to_vec()].concat()).unwrap();
    fs::write(&b, [head, b"tail-b".to_vec()].concat()).unwrap();
    let prefix_a = sha256_reader(a.to_str().unwrap(), Some(PREFIX_HASH_BYTES)).unwrap();
    let prefix_b = sha256_reader(b.to_str().unwrap(), Some(PREFIX_HASH_BYTES)).unwrap();
    let full_a = sha256_path(a.to_str().unwrap()).unwrap();
    let full_b = sha256_path(b.to_str().unwrap()).unwrap();
    let _ = fs::remove_file(&a);
    let _ = fs::remove_file(&b);
    assert_eq!(prefix_a, prefix_b);
    assert_ne!(full_a, full_b);
}
