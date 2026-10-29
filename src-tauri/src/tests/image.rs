use super::*;
use image::DynamicImage;

#[test]
fn downscale_to_fit_leaves_small_images_alone() {
    let image = DynamicImage::new_rgb8(10, 20);
    let out = downscale_to_fit(image, 64);
    assert_eq!((out.width(), out.height()), (10, 20));
}

#[test]
fn downscale_to_fit_shrinks_the_longest_edge() {
    let image = DynamicImage::new_rgb8(200, 100);
    let out = downscale_to_fit(image, 50);
    assert!(out.width() <= 50 && out.height() <= 50);
}

#[test]
fn decode_accepts_an_ordinary_image() {
    let path = std::env::temp_dir().join("pk-decode-small.png");
    DynamicImage::new_rgb8(32, 32)
        .save(&path)
        .expect("write small png");

    let image = decode_oriented_image(path.to_str().unwrap()).expect("small image should decode");
    assert_eq!((image.width(), image.height()), (32, 32));
    let _ = std::fs::remove_file(path);
}

#[test]
fn decode_rejects_buffers_over_the_limit() {
    // Real decompression bombs are impractical to write here, so the guard is
    // exercised through the internal entry point with a 1-byte budget.
    let path = std::env::temp_dir().join("pk-decode-limit.png");
    DynamicImage::new_rgb8(64, 64).save(&path).expect("write png");

    let err = decode_within(path.to_str().unwrap(), 1).expect_err("limit should trip");
    assert!(
        err.contains("would decode to") && err.contains("limit 1"),
        "unexpected error: {err}"
    );
    let _ = std::fs::remove_file(path);
}
