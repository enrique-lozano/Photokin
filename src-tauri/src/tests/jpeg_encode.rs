use super::*;

fn photo(width: u32, height: u32) -> DynamicImage {
    DynamicImage::ImageRgb8(image::RgbImage::from_fn(width, height, |x, y| {
        image::Rgb([
            ((x * 71 + y * 17) % 256) as u8,
            ((x * 31 + y * 61) % 256) as u8,
            ((x * 13 + y * 23) % 256) as u8,
        ])
    }))
}

fn frame(jpeg: &[u8]) -> (u32, u32, Vec<u8>) {
    assert_eq!(&jpeg[..2], &[0xff, 0xd8]);
    let mut offset = 2;
    loop {
        assert_eq!(jpeg[offset], 0xff);
        let marker = jpeg[offset + 1];
        let length = u16::from_be_bytes([jpeg[offset + 2], jpeg[offset + 3]]) as usize;
        // All encodes must be baseline, not mozjpeg's default progressive output.
        assert_ne!(marker, 0xc2);
        assert_ne!(marker, 0xda, "No baseline frame before scan");
        if marker == 0xc0 {
            let data = &jpeg[offset + 4..offset + 2 + length];
            assert_eq!(data[0], 8);
            let height = u16::from_be_bytes([data[1], data[2]]) as u32;
            let width = u16::from_be_bytes([data[3], data[4]]) as u32;
            let sampling = (0..data[5] as usize).map(|i| data[7 + i * 3]).collect();
            return (width, height, sampling);
        }
        offset += length + 2;
    }
}

#[test]
fn sampling_matches_requested_factors_including_odd_dimensions() {
    for (width, height) in [(32, 24), (31, 25), (1, 1)] {
        for (sampling, factors) in [
            (JpegSubsampling::S444, vec![0x11, 0x11, 0x11]),
            (JpegSubsampling::S422, vec![0x21, 0x11, 0x11]),
            (JpegSubsampling::S420, vec![0x22, 0x11, 0x11]),
        ] {
            for optimize in [false, true] {
                let bytes = encode(&photo(width, height), 85, sampling, optimize).unwrap();
                assert_eq!(frame(&bytes), (width, height, factors.clone()));
                let decoded = image::load_from_memory(&bytes).unwrap();
                assert_eq!((decoded.width(), decoded.height()), (width, height));
            }
        }
    }
}

#[test]
fn grayscale_stays_single_component_for_every_sampling_option() {
    for (width, height) in [(32, 24), (31, 25), (1, 1)] {
        let image = DynamicImage::ImageLuma8(image::GrayImage::from_fn(width, height, |x, y| {
            image::Luma([((x * 31 + y * 17) % 256) as u8])
        }));
        for sampling in [
            JpegSubsampling::S444,
            JpegSubsampling::S422,
            JpegSubsampling::S420,
        ] {
            let plain = encode(&image, 85, sampling, false).unwrap();
            let optimized = encode(&image, 85, sampling, true).unwrap();
            assert_eq!(frame(&plain), (width, height, vec![0x11]));
            assert_eq!(frame(&optimized), (width, height, vec![0x11]));
            let plain_pixels = image::load_from_memory(&plain).unwrap();
            assert_eq!(plain_pixels.color(), image::ColorType::L8);
            assert_eq!(
                plain_pixels.as_bytes(),
                image::load_from_memory(&optimized).unwrap().as_bytes()
            );
        }
    }
}

#[test]
fn huffman_optimization_changes_bytes_not_pixels_even_across_sink_flushes() {
    let image = photo(521, 389);
    for quality in [1, 85, 100] {
        for sampling in [
            JpegSubsampling::S444,
            JpegSubsampling::S422,
            JpegSubsampling::S420,
        ] {
            let plain = encode(&image, quality, sampling, false).unwrap();
            let optimized = encode(&image, quality, sampling, true).unwrap();
            assert_ne!(plain, optimized);
            assert!(optimized.len() <= plain.len());
            assert_eq!(
                image::load_from_memory(&plain).unwrap().as_bytes(),
                image::load_from_memory(&optimized).unwrap().as_bytes()
            );
            if quality == 100 {
                assert!(plain.len() > 65536);
                assert!(optimized.len() > 65536);
            }
        }
    }
}

#[test]
fn invalid_quality_alpha_high_depth_and_empty_images_are_rejected() {
    for quality in [0, 101, 255] {
        assert!(encode(&photo(7, 9), quality, JpegSubsampling::S444, true).is_err());
    }
    for image in [
        DynamicImage::new_rgba8(7, 9),
        DynamicImage::new_luma_a8(7, 9),
        DynamicImage::new_rgb16(7, 9),
        DynamicImage::new_luma16(7, 9),
        DynamicImage::new_rgb8(0, 9),
        DynamicImage::new_rgb8(7, 0),
        // libjpeg's dimension limit must return an error, not terminate the process.
        DynamicImage::new_rgb8(65536, 1),
    ] {
        assert!(encode(&image, 85, JpegSubsampling::S444, true).is_err());
    }
    assert!(encode(&photo(3, 5), 85, JpegSubsampling::S444, true).is_ok());
}

#[test]
fn sampling_ipc_values_are_exact_strings() {
    assert_eq!(JpegSubsampling::default(), JpegSubsampling::S444);
    for (value, sampling) in [
        ("444", JpegSubsampling::S444),
        ("422", JpegSubsampling::S422),
        ("420", JpegSubsampling::S420),
    ] {
        assert_eq!(
            serde_json::from_value::<JpegSubsampling>(value.into()).unwrap(),
            sampling
        );
        assert_eq!(serde_json::to_value(sampling).unwrap(), value);
    }
    for value in [
        serde_json::json!("411"),
        serde_json::json!(444),
        serde_json::Value::Null,
    ] {
        assert!(serde_json::from_value::<JpegSubsampling>(value).is_err());
    }
}
