use super::*;

fn edit() -> ImageEdit {
    ImageEdit {
        turns: 0,
        flip_horizontal: false,
        flip_vertical: false,
        crop: [0.0, 0.0, 1.0, 1.0],
        width: 8,
        height: 6,
        format: "png".into(),
        quality: 92,
    }
}

#[test]
fn crop_rotate_resize() {
    let mut settings = edit();
    settings.turns = 1;
    settings.crop = [0.0, 0.0, 0.5, 1.0];
    settings.width = 3;
    settings.height = 4;
    let output = transform(DynamicImage::new_rgb8(8, 6), &settings).unwrap();
    assert_eq!((output.width(), output.height()), (3, 4));
}

#[test]
fn refuses_invalid_crop_and_upscale() {
    for crop in [
        [-0.1, 0.0, 1.0, 1.0],
        [0.5, 0.0, 1.0, 1.0],
        [f64::NAN, 0.0, 1.0, 1.0],
        [0.0, 0.0, f64::INFINITY, 1.0],
        [0.0, 0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0, 0.0],
    ] {
        let mut settings = edit();
        settings.crop = crop;
        assert!(transform(DynamicImage::new_rgb8(8, 6), &settings).is_err());
    }
    let mut settings = edit();
    settings.width = 9;
    assert!(transform(DynamicImage::new_rgb8(8, 6), &settings).is_err());
    for settings in [
        ImageEdit { turns: 4, ..edit() },
        ImageEdit {
            quality: 0,
            ..edit()
        },
        ImageEdit {
            quality: 101,
            ..edit()
        },
        ImageEdit { width: 0, ..edit() },
        ImageEdit {
            height: 0,
            ..edit()
        },
    ] {
        assert!(transform(DynamicImage::new_rgb8(8, 6), &settings).is_err());
    }
}

#[test]
fn encodes_supported_formats_and_preserves_alpha() {
    for format in ["jpg", "png", "webp"] {
        let mut settings = edit();
        settings.format = format.into();
        let bytes = encode(&DynamicImage::new_rgb8(8, 6), &settings).unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (8, 6));
    }
    assert!(encode(
        &DynamicImage::new_rgba8(8, 6),
        &ImageEdit {
            format: "jpg".into(),
            ..edit()
        }
    )
    .is_err());
}

#[test]
fn quality_samples_reflect_compression_and_preserve_the_display_profile() {
    let image = DynamicImage::ImageRgb8(image::RgbImage::from_fn(128, 96, |x, y| {
        image::Rgb([
            ((x * 71 + y * 17) % 256) as u8,
            ((x * 31 + y * 61) % 256) as u8,
            ((x * 13 + y * 23) % 256) as u8,
        ])
    }));
    for format in ["jpg", "png", "webp"] {
        let (display, bytes) =
            encode_preview(&image, format.into(), 80, b"test color profile").unwrap();
        assert!(bytes > 0);
        let reader = ImageReader::new(std::io::Cursor::new(&display))
            .with_guessed_format()
            .unwrap();
        let mut decoder = reader.into_decoder().unwrap();
        assert_eq!(decoder.dimensions(), (128, 96));
        assert_eq!(
            decoder.icc_profile().unwrap().unwrap(),
            b"test color profile"
        );
    }
    let (low, low_bytes) = encode_preview(&image, "jpg".into(), 20, &[]).unwrap();
    let (high, high_bytes) = encode_preview(&image, "jpg".into(), 95, &[]).unwrap();
    assert!(low_bytes < high_bytes);
    assert_ne!(low, high);
    assert!(encode_preview(&image, "jpg".into(), 0, &[]).is_err());
    assert!(encode_preview(&image, "jpg".into(), 101, &[]).is_err());
}

#[test]
fn preview_cache_is_bounded_read_only_and_cleans_its_temporary_files() {
    let source = std::env::temp_dir().join(format!("photokin-sample-{}.png", std::process::id()));
    DynamicImage::new_rgb8(2000, 1000).save(&source).unwrap();
    let original = std::fs::read(&source).unwrap();
    let source_path = source.to_string_lossy().into_owned();
    tauri::async_runtime::block_on(async {
        clear_image_edit_preview().await.unwrap();
        let first = preview_image_edit(source_path.clone(), "jpg".into(), 80)
            .await
            .unwrap();
        assert_eq!((first.width, first.height), (1600, 800));
        let second = preview_image_edit(source_path.clone(), "jpg".into(), 60)
            .await
            .unwrap();
        let third = preview_image_edit(source_path.clone(), "png".into(), 100)
            .await
            .unwrap();
        assert!(!Path::new(&first.preview_path).exists());
        assert!(Path::new(&second.preview_path).exists());
        assert!(Path::new(&third.preview_path).exists());
        {
            let cache = EDIT_PREVIEW.lock().unwrap();
            let current = cache.as_ref().unwrap();
            assert_eq!(current.paths.len(), 2);
            assert!(current.image.width() <= EDIT_PREVIEW_EDGE);
            assert!(current.image.height() <= EDIT_PREVIEW_EDGE);
        }
        assert_eq!(std::fs::read(&source).unwrap(), original);
        clear_image_edit_preview().await.unwrap();
        assert!(!Path::new(&second.preview_path).exists());
        assert!(!Path::new(&third.preview_path).exists());
        assert!(EDIT_PREVIEW.lock().unwrap().is_none());
    });
    std::fs::remove_file(source).unwrap();
}

#[test]
fn staged_files_never_clobber_copies_and_detect_source_changes() {
    let directory = std::env::temp_dir().join(format!(
        "photokin-editor-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let source = directory.join("original.png");
    DynamicImage::new_rgb8(8, 6).save(&source).unwrap();
    let original = std::fs::read(&source).unwrap();
    let source_path = source.to_string_lossy().into_owned();
    tauri::async_runtime::block_on(async {
        let prepared = prepare_image_edit(source_path.clone(), None, edit())
            .await
            .unwrap();
        let copy = directory.join("copy.png");
        std::fs::write(&copy, b"keep existing file").unwrap();
        assert!(commit_image_edit(
            source_path.clone(),
            prepared.temp_path.clone(),
            copy.to_string_lossy().into_owned(),
            prepared.source_hash.clone()
        )
        .await
        .is_err());
        assert_eq!(std::fs::read(&copy).unwrap(), b"keep existing file");
        assert_eq!(std::fs::read(&source).unwrap(), original);
        std::fs::remove_file(&copy).unwrap();
        commit_image_edit(
            source_path.clone(),
            prepared.temp_path.clone(),
            copy.to_string_lossy().into_owned(),
            prepared.source_hash,
        )
        .await
        .unwrap();
        assert!(copy.exists());
        assert!(!Path::new(&prepared.temp_path).exists());
        assert_eq!(std::fs::read(&source).unwrap(), original);
        let conflict = prepare_image_edit(source_path.clone(), None, edit())
            .await
            .unwrap();
        std::fs::write(&source, b"external change").unwrap();
        assert!(commit_image_edit(
            source_path.clone(),
            conflict.temp_path.clone(),
            source_path.clone(),
            conflict.source_hash
        )
        .await
        .is_err());
        assert_eq!(std::fs::read(&source).unwrap(), b"external change");
        discard_image_edit(source_path.clone(), conflict.temp_path.clone())
            .await
            .unwrap();
        assert!(!Path::new(&conflict.temp_path).exists());
    });
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn overwrite_publishes_complete_encoded_file() {
    let directory = std::env::temp_dir().join(format!(
        "photokin-overwrite-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let source = directory.join("original.png");
    DynamicImage::new_rgb8(8, 6).save(&source).unwrap();
    let source_path = source.to_string_lossy().into_owned();
    tauri::async_runtime::block_on(async {
        let prepared = prepare_image_edit(
            source_path.clone(),
            None,
            ImageEdit {
                width: 4,
                height: 3,
                ..edit()
            },
        )
        .await
        .unwrap();
        commit_image_edit(
            source_path.clone(),
            prepared.temp_path,
            source_path.clone(),
            prepared.source_hash,
        )
        .await
        .unwrap();
    });
    let output = image::open(&source).unwrap();
    assert_eq!((output.width(), output.height()), (4, 3));
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn demo_orientation_samples_edit_to_each_supported_format() {
    let samples =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo/exif-samples/jpg/orientation");
    let directory = std::env::temp_dir().join(format!(
        "photokin-orientation-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    for family in ["landscape", "portrait"] {
        let reference =
            decode_oriented_image(samples.join(format!("{family}_1.jpg")).to_str().unwrap())
                .unwrap();
        for orientation in 1..=8 {
            let name = format!("{family}_{orientation}.jpg");
            let source = directory.join(&name);
            std::fs::copy(samples.join(&name), &source).unwrap();
            let original = std::fs::read(&source).unwrap();
            let decoded = decode_oriented_image(source.to_str().unwrap()).unwrap();
            assert_eq!(
                (decoded.width(), decoded.height()),
                (reference.width(), reference.height()),
                "{name} must be displayed upright"
            );
            let raw = image::open(&source).unwrap();
            let expected = match orientation {
                1 => raw,
                2 => raw.fliph(),
                3 => raw.rotate180(),
                4 => raw.flipv(),
                5 => raw.rotate90().fliph(),
                6 => raw.rotate90(),
                7 => raw.rotate90().flipv(),
                _ => raw.rotate270(),
            };
            assert!(
                decoded.to_rgb8() == expected.to_rgb8(),
                "{name} must apply the exact EXIF orientation to its raw pixels"
            );
            for format in ["jpg", "png", "webp"] {
                let settings = ImageEdit {
                    turns: 1,
                    flip_horizontal: true,
                    crop: [0.125, 0.125, 0.75, 0.75],
                    width: 32,
                    height: 24,
                    format: format.into(),
                    ..edit()
                };
                tauri::async_runtime::block_on(async {
                    let prepared =
                        prepare_image_edit(source.to_string_lossy().into_owned(), None, settings)
                            .await
                            .unwrap_or_else(|error| panic!("{name} -> {format}: {error}"));
                    let bytes = std::fs::read(&prepared.temp_path).unwrap();
                    let expected = match format {
                        "jpg" => image::ImageFormat::Jpeg,
                        "png" => image::ImageFormat::Png,
                        _ => image::ImageFormat::WebP,
                    };
                    assert_eq!(image::guess_format(&bytes).unwrap(), expected);
                    let output = image::load_from_memory(&bytes).unwrap();
                    assert_eq!((output.width(), output.height()), (32, 24));
                    discard_image_edit(source.to_string_lossy().into_owned(), prepared.temp_path)
                        .await
                        .unwrap();
                });
                assert_eq!(std::fs::read(&source).unwrap(), original);
            }
        }
    }
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn preserves_high_bit_depth_and_transparency_or_refuses_conversion() {
    let deep = DynamicImage::ImageRgb16(image::ImageBuffer::from_pixel(
        8,
        6,
        image::Rgb([1000_u16, 32000, 65000]),
    ));
    let bytes = encode(&deep, &edit()).unwrap();
    let decoded = image::load_from_memory(&bytes).unwrap();
    assert_eq!(decoded.to_rgb16(), deep.to_rgb16());
    for format in ["jpg", "webp"] {
        assert!(encode(
            &deep,
            &ImageEdit {
                format: format.into(),
                ..edit()
            }
        )
        .unwrap_err()
        .contains("high bit depth"));
    }
    let transparent = DynamicImage::ImageRgba8(image::ImageBuffer::from_pixel(
        8,
        6,
        image::Rgba([240, 120, 60, 64]),
    ));
    for format in ["png", "webp"] {
        let bytes = encode(
            &transparent,
            &ImageEdit {
                format: format.into(),
                ..edit()
            },
        )
        .unwrap();
        let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert!(decoded.pixels().all(|pixel| pixel[3] == 64));
    }
    assert!(encode(
        &transparent,
        &ImageEdit {
            format: "jpg".into(),
            ..edit()
        }
    )
    .unwrap_err()
    .contains("transparency"));
}

#[test]
fn every_rotation_and_flip_moves_pixels_to_the_expected_coordinates() {
    let source = image::RgbImage::from_fn(8, 6, |column, row| {
        image::Rgb([(column + row * 8) as u8, column as u8, row as u8])
    });
    for turns in 0..=3 {
        for flip_horizontal in [false, true] {
            for flip_vertical in [false, true] {
                let (width, height) = if turns % 2 == 0 { (8, 6) } else { (6, 8) };
                let output = transform(
                    DynamicImage::ImageRgb8(source.clone()),
                    &ImageEdit {
                        turns,
                        flip_horizontal,
                        flip_vertical,
                        width,
                        height,
                        ..edit()
                    },
                )
                .unwrap()
                .to_rgb8();
                for (column, row, pixel) in source.enumerate_pixels() {
                    let (mut target_column, mut target_row) = match turns {
                        0 => (column, row),
                        1 => (5 - row, column),
                        2 => (7 - column, 5 - row),
                        _ => (row, 7 - column),
                    };
                    if flip_horizontal {
                        target_column = width - 1 - target_column;
                    }
                    if flip_vertical {
                        target_row = height - 1 - target_row;
                    }
                    assert_eq!(output.get_pixel(target_column, target_row), pixel);
                }
            }
        }
    }
}

#[test]
fn unsupported_demo_formats_use_the_supplied_full_resolution_preview() {
    let samples = Path::new(env!("CARGO_MANIFEST_DIR")).join("../demo/exif-samples");
    let directory = std::env::temp_dir().join(format!(
        "photokin-fallback-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let preview = directory.join("full-resolution.png");
    image::RgbImage::from_pixel(8, 6, image::Rgb([120, 60, 30]))
        .save(&preview)
        .unwrap();
    for relative in [
        "heic/spring_1440x960.heic",
        "avif/mountains.avif",
        "jxl/test_0001.jxl",
    ] {
        let source = directory.join(Path::new(relative).file_name().unwrap());
        std::fs::copy(samples.join(relative), &source).unwrap();
        let source_path = source.to_string_lossy().into_owned();
        let original = std::fs::read(&source).unwrap();
        tauri::async_runtime::block_on(async {
            assert!(prepare_image_edit(source_path.clone(), None, edit())
                .await
                .is_err());
            let prepared = prepare_image_edit(
                source_path.clone(),
                Some(preview.to_string_lossy().into_owned()),
                ImageEdit {
                    format: "jpg".into(),
                    ..edit()
                },
            )
            .await
            .unwrap();
            let output = image::load_from_memory(&std::fs::read(&prepared.temp_path).unwrap())
                .unwrap()
                .to_rgb8();
            for pixel in output.pixels() {
                for (actual, expected) in pixel.0.iter().zip([120_u8, 60, 30]) {
                    assert!(actual.abs_diff(expected) <= 3);
                }
            }
            discard_image_edit(source_path.clone(), prepared.temp_path)
                .await
                .unwrap();
        });
        assert_eq!(std::fs::read(&source).unwrap(), original);
    }
    let broken = directory.join("broken.jpg");
    std::fs::copy(samples.join("jpg/corrupted.jpg"), &broken).unwrap();
    std::fs::OpenOptions::new()
        .write(true)
        .open(&broken)
        .unwrap()
        .set_len(32)
        .unwrap();
    tauri::async_runtime::block_on(async {
        assert!(
            prepare_image_edit(broken.to_string_lossy().into_owned(), None, edit())
                .await
                .is_err()
        );
    });
    assert!(!std::fs::read_dir(&directory).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".photokin-edit-")
    }));
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn read_only_originals_and_invalid_staging_paths_are_never_replaced() {
    let directory = std::env::temp_dir().join(format!(
        "photokin-readonly-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&directory).unwrap();
    let source = directory.join("source with spaces \u{00e9}.png");
    DynamicImage::new_rgb8(8, 6).save(&source).unwrap();
    let source_path = source.to_string_lossy().into_owned();
    let original = std::fs::read(&source).unwrap();
    let prepared =
        tauri::async_runtime::block_on(prepare_image_edit(source_path.clone(), None, edit()))
            .unwrap();
    let permissions = std::fs::metadata(&source).unwrap().permissions();
    let mut read_only = permissions.clone();
    read_only.set_readonly(true);
    std::fs::set_permissions(&source, read_only).unwrap();
    let result = tauri::async_runtime::block_on(commit_image_edit(
        source_path.clone(),
        prepared.temp_path.clone(),
        source_path.clone(),
        prepared.source_hash,
    ));
    std::fs::set_permissions(&source, permissions).unwrap();
    assert!(result.unwrap_err().contains("read-only"));
    assert_eq!(std::fs::read(&source).unwrap(), original);
    assert!(Path::new(&prepared.temp_path).exists());
    tauri::async_runtime::block_on(async {
        assert!(discard_image_edit(source_path.clone(), source_path.clone())
            .await
            .is_err());
        assert_eq!(std::fs::read(&source).unwrap(), original);
        discard_image_edit(source_path, prepared.temp_path)
            .await
            .unwrap();
    });
    std::fs::remove_dir_all(directory).unwrap();
}
