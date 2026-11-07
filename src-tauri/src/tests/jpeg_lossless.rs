use super::*;
use crate::shared::decode_oriented_image;
use ::image::{codecs::jpeg::JpegEncoder, DynamicImage, ExtendedColorType, RgbImage};
use std::path::Path;

fn fixture(name: &str) -> String {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../demo/exif-samples/jpg/orientation")
        .join(name)
        .to_string_lossy()
        .into_owned()
}

fn apply(image: &DynamicImage, turns: u8, flip_h: bool, flip_v: bool) -> DynamicImage {
    let mut out = image.clone();
    for _ in 0..turns {
        out = out.rotate90();
    }
    if flip_h {
        out = out.fliph();
    }
    if flip_v {
        out = out.flipv();
    }
    out
}

fn difference(actual: &DynamicImage, expected: &DynamicImage) -> (f64, u8) {
    assert_eq!(
        (actual.width(), actual.height()),
        (expected.width(), expected.height())
    );
    let (actual, expected) = (actual.to_rgb8(), expected.to_rgb8());
    let (mut total, mut worst) = (0u64, 0u8);
    for (a, b) in actual.as_raw().iter().zip(expected.as_raw()) {
        let delta = a.abs_diff(*b);
        total += delta as u64;
        worst = worst.max(delta);
    }
    (total as f64 / actual.as_raw().len() as f64, worst)
}

fn gradient_jpeg(width: u32, height: u32) -> Vec<u8> {
    let pixels = RgbImage::from_fn(width, height, |x, y| {
        ::image::Rgb([
            (x * 255 / width) as u8,
            (y * 255 / height) as u8,
            ((x * 7 + y * 13) % 256) as u8,
        ])
    });
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, 95)
        .encode(pixels.as_raw(), width, height, ExtendedColorType::Rgb8)
        .unwrap();
    bytes
}

const EDITS: [(u8, bool, bool); 8] = [
    (0, false, false),
    (0, true, false),
    (0, false, true),
    (1, false, false),
    (2, false, false),
    (3, false, false),
    (1, true, false),
    (1, false, true),
];

fn crops(width: u32, height: u32) -> [Rect; 4] {
    [
        Rect { x: 0, y: 0, width, height },
        Rect { x: 5, y: 3, width: width / 2, height: height / 2 },
        Rect { x: width / 3, y: height / 4, width: width - width / 3, height: height - height / 4 },
        Rect { x: width - 20, y: height - 20, width: 20, height: 20 },
    ]
}

fn assert_matches_reference(
    source: &[u8],
    oriented: &DynamicImage,
    transform_to_apply: Dihedral,
    edit: (u8, bool, bool),
    tolerance: (f64, u8),
) {
    let full = apply(oriented, edit.0, edit.1, edit.2);
    for crop in crops(full.width(), full.height()) {
        let (jpeg, rect) = transform(source, transform_to_apply, crop).unwrap();
        assert_eq!(plan(source, transform_to_apply, crop).unwrap(), rect);
        let actual = ::image::load_from_memory(&jpeg).unwrap();
        assert_eq!((actual.width(), actual.height()), (rect.width, rect.height));
        // Leading partial blocks (at most one 16 px MCU) can be dropped by rotations and flips.
        assert!(rect.x <= crop.x.max(15) && rect.y <= crop.y.max(15), "{edit:?} {crop:?} -> {rect:?}");
        assert!(rect.x + rect.width >= crop.x + crop.width);
        assert!(rect.y + rect.height >= crop.y + crop.height);
        let expected = full.crop_imm(rect.x, rect.y, rect.width, rect.height);
        let (mean, worst) = difference(&actual, &expected);
        assert!(
            mean <= tolerance.0 && worst <= tolerance.1,
            "{edit:?} {crop:?} -> {rect:?}: mean {mean}, worst {worst}"
        );
    }
}

#[test]
fn matches_pixel_transforms_for_full_color_jpegs() {
    for (width, height) in [(64, 48), (61, 45), (37, 29)] {
        let source = gradient_jpeg(width, height);
        let oriented = ::image::load_from_memory(&source).unwrap();
        for edit in EDITS {
            let dihedral = Dihedral::from_edit(edit.0, edit.1, edit.2);
            assert_matches_reference(&source, &oriented, dihedral, edit, (0.5, 3));
        }
    }
}

#[test]
fn matches_pixel_transforms_for_subsampled_photos_with_every_exif_orientation() {
    for orientation in 1..=8u8 {
        let name = format!("landscape_{orientation}.jpg");
        let path = fixture(&name);
        let source = std::fs::read(&path).unwrap();
        let oriented = decode_oriented_image(&path).unwrap();
        for edit in EDITS {
            let dihedral = Dihedral::from_exif_orientation(orientation)
                .then(Dihedral::from_edit(edit.0, edit.1, edit.2));
            assert_matches_reference(&source, &oriented, dihedral, edit, (2.5, 90));
        }
    }
}

#[test]
fn crops_snap_to_the_block_grid_without_shrinking() {
    let source = gradient_jpeg(64, 48);
    let crop = Rect { x: 5, y: 3, width: 20, height: 20 };
    let rect = plan(&source, Dihedral::IDENTITY, crop).unwrap();
    assert_eq!((rect.x % 8, rect.y % 8), (0, 0));
    assert_eq!(rect, Rect { x: 0, y: 0, width: 25, height: 23 });
}

#[test]
fn lossless_output_is_not_larger_than_the_source_and_keeps_all_blocks() {
    let source = gradient_jpeg(64, 48);
    let full = Rect { x: 0, y: 0, width: 64, height: 48 };
    let (jpeg, rect) = transform(&source, Dihedral::IDENTITY, full).unwrap();
    assert_eq!(rect, full);
    assert!(jpeg.len() <= source.len());
    let (mean, worst) = difference(
        &::image::load_from_memory(&jpeg).unwrap(),
        &::image::load_from_memory(&source).unwrap(),
    );
    assert_eq!((mean, worst), (0.0, 0));
}

#[test]
fn rejects_unsupported_input_and_out_of_range_crops() {
    let source = gradient_jpeg(32, 32);
    let crop = Rect { x: 0, y: 0, width: 32, height: 32 };
    assert!(transform(b"not a jpeg", Dihedral::IDENTITY, crop).is_err());
    for bad in [
        Rect { x: 0, y: 0, width: 0, height: 8 },
        Rect { x: 0, y: 0, width: 33, height: 8 },
        Rect { x: u32::MAX, y: 0, width: 8, height: 8 },
    ] {
        assert!(transform(&source, Dihedral::IDENTITY, bad).is_err());
    }
}

#[test]
fn composes_exif_orientation_with_edits() {
    assert_eq!(Dihedral::from_exif_orientation(1), Dihedral::IDENTITY);
    assert_eq!(
        Dihedral::from_exif_orientation(3),
        Dihedral::from_edit(2, false, false)
    );
    assert_eq!(
        Dihedral::from_exif_orientation(3).then(Dihedral::from_edit(2, false, false)),
        Dihedral::IDENTITY
    );
    assert_eq!(
        Dihedral::from_edit(0, true, true),
        Dihedral::from_edit(2, false, false)
    );
}
