use super::*;

fn test_dir() -> PathBuf {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = env::temp_dir().join(format!(
        "photokin-exiftool-test-\u{00e9}\u{65e5}-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir(&dir).unwrap();
    dir
}

#[test]
fn pinned_distributions_match_the_version_and_have_sha256_checksums() {
    for (windows, x86) in [(true, true), (true, false), (false, false)] {
        let (archive, checksum) = distribution(windows, x86);
        assert!(archive.contains(MANAGED_VERSION));
        assert_eq!(checksum.len(), 64);
        assert!(checksum.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

#[test]
fn checksum_rejects_tampered_downloads() {
    let bytes = b"verified archive";
    let checksum = format!("{:x}", Sha256::digest(bytes));
    verify_checksum(bytes, &checksum).unwrap();
    assert!(verify_checksum(b"tampered archive", &checksum)
        .unwrap_err()
        .contains("checksum"));
}

#[cfg(windows)]
#[test]
fn unicode_launch_directory_uses_an_alias_or_explains_the_limitation() {
    let data = test_dir();
    match launch_dir(&data) {
        Ok(alias) => {
            assert!(alias.as_os_str().to_string_lossy().is_ascii());
            assert_eq!(
                fs::canonicalize(alias).unwrap(),
                fs::canonicalize(&data).unwrap()
            );
        }
        Err(error) => assert!(error.contains("ASCII-only folder")),
    }
    fs::remove_dir_all(&data).unwrap();
}

#[test]
fn installation_paths_reject_traversal_and_absolute_paths() {
    assert_eq!(install_path(Path::new("archive/../outside")), None);
    assert_eq!(install_path(Path::new("/archive/outside")), None);
}

#[test]
fn failed_installation_preserves_the_previous_copy_and_selection() {
    let data = test_dir();
    let previous = data.join("previous");
    fs::create_dir(&previous).unwrap();
    fs::write(previous.join("exiftool"), b"working").unwrap();
    save_dir(&data, &previous).unwrap();
    let result = install_managed(&data, |stage| {
        fs::write(stage.join("partial"), b"incomplete").unwrap();
        Err("Verification failed".into())
    });
    assert_eq!(result.unwrap_err(), "Verification failed");
    assert_eq!(fs::read(previous.join("exiftool")).unwrap(), b"working");
    assert_eq!(
        fs::read_to_string(data.join(SAVED_DIR_FILE)).unwrap(),
        previous.to_str().unwrap()
    );
    assert_eq!(fs::read_dir(data.join(INSTALL_DIR)).unwrap().count(), 0);
    fs::remove_dir_all(&data).unwrap();
}

#[test]
fn successful_installation_is_versioned_and_requires_explicit_activation() {
    let data = test_dir();
    let previous = data.join("previous");
    save_dir(&data, &previous).unwrap();
    let dest = install_managed(&data, |stage| {
        fs::write(stage.join("exiftool"), b"verified").unwrap();
        Ok(())
    })
    .unwrap();
    assert!(dest
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with(MANAGED_VERSION));
    assert_eq!(fs::read(dest.join("exiftool")).unwrap(), b"verified");
    assert_eq!(
        fs::read_to_string(data.join(SAVED_DIR_FILE)).unwrap(),
        previous.to_str().unwrap()
    );
    save_dir(&data, &dest).unwrap();
    assert_eq!(
        fs::read_to_string(data.join(SAVED_DIR_FILE)).unwrap(),
        dest.to_str().unwrap()
    );
    fs::remove_dir_all(&data).unwrap();
}

#[test]
fn failed_selection_save_preserves_the_existing_selection() {
    let data = test_dir();
    save_dir(&data, Path::new("previous")).unwrap();
    fs::create_dir(data.join("exiftool-dir.tmp")).unwrap();
    assert!(save_dir(&data, Path::new("replacement")).is_err());
    assert_eq!(
        fs::read_to_string(data.join(SAVED_DIR_FILE)).unwrap(),
        "previous"
    );
    fs::remove_dir_all(&data).unwrap();
}

#[test]
fn perl_archive_preserves_script_and_libraries() {
    let mut archive = tar::Builder::new(Vec::new());
    for (path, bytes) in [
        (
            "Image-ExifTool-13.60/exiftool",
            b"#!/usr/bin/env perl\n".as_slice(),
        ),
        (
            "Image-ExifTool-13.60/lib/Image/ExifTool.pm",
            b"package Image::ExifTool;".as_slice(),
        ),
    ] {
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        archive.append_data(&mut header, path, bytes).unwrap();
    }
    let tar = archive.into_inner().unwrap();
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    std::io::Write::write_all(&mut gzip, &tar).unwrap();
    let data = test_dir();
    let mut progress = Vec::new();
    extract_perl(gzip.finish().unwrap(), &data, |percent| {
        progress.push(percent);
        Ok(())
    })
    .unwrap();
    assert_eq!(
        fs::read(data.join("exiftool")).unwrap(),
        b"#!/usr/bin/env perl\n"
    );
    assert_eq!(
        fs::read(data.join("lib/Image/ExifTool.pm")).unwrap(),
        b"package Image::ExifTool;"
    );
    assert_eq!(progress, vec![0, 100]);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(data.join("exiftool"))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }
    fs::remove_dir_all(&data).unwrap();
}

#[test]
fn manual_version_check_rejects_non_version_output() {
    for version in ["13.60", "12.76"] {
        assert!(valid_version(version));
    }
    for version in ["", "not ExifTool", "13", "13.", ".60", "13.60\nunexpected"] {
        assert!(!valid_version(version));
    }
}

#[test]
#[ignore = "Downloads the official pinned distribution and runs real ExifTool; requires network and Perl on Unix."]
fn managed_installation_downloads_and_checks_real_exiftool() {
    let data = test_dir();
    let result = install_managed(&data, |stage| download_and_extract(stage, |_, _, _| Ok(())));
    if let Ok(dest) = &result {
        save_dir(&data, dest).unwrap();
        verify_installation(dest).unwrap();
    }
    fs::remove_dir_all(&data).unwrap();
    result.unwrap();
}

#[test]
#[ignore = "Downloads and checks the official Perl distribution; requires network."]
fn managed_perl_distribution_downloads_and_extracts() {
    let data = test_dir();
    let result = (|| {
        let (archive, checksum) = distribution(false, false);
        let response = ureq::get(&format!("{DOWNLOAD_URL}/{archive}"))
            .call()
            .map_err(|error| error.to_string())?;
        let bytes = download_bytes(response.into_reader(), None, |_| Ok(()))?;
        verify_checksum(&bytes, checksum)?;
        extract_perl(bytes, &data, |_| Ok(()))?;
        if !data.join("exiftool").is_file() || !data.join("lib/Image/ExifTool.pm").is_file() {
            return Err("The Perl distribution is incomplete.".to_string());
        }
        Ok(())
    })();
    fs::remove_dir_all(&data).unwrap();
    result.unwrap();
}

#[test]
fn install_path_drops_top_folder_and_renames_the_exe() {
    assert_eq!(install_path(Path::new("exiftool-13.59_64")), None);
    assert_eq!(
        install_path(Path::new("exiftool-13.59_64/exiftool(-k).exe")),
        Some(PathBuf::from("exiftool.exe"))
    );
    assert_eq!(
        install_path(Path::new("exiftool-13.59_64/exiftool_files/perl.exe")),
        Some(PathBuf::from("exiftool_files/perl.exe"))
    );
}

#[test]
fn download_reports_real_percentages_and_preserves_bytes() {
    let source = vec![42; 200_000];
    let mut progress = Vec::new();
    let bytes = download_bytes(Cursor::new(&source), Some(source.len() as u64), |percent| {
        progress.push(percent);
        Ok(())
    })
    .unwrap();

    assert_eq!(bytes, source);
    assert_eq!(
        progress,
        vec![Some(0), Some(32), Some(65), Some(98), Some(99), Some(100)]
    );
}

#[test]
fn unknown_or_zero_download_size_stays_indeterminate_until_complete() {
    for total in [None, Some(0)] {
        let mut progress = Vec::new();
        let bytes = download_bytes(Cursor::new(b"archive"), total, |percent| {
            progress.push(percent);
            Ok(())
        })
        .unwrap();

        assert_eq!(bytes, b"archive");
        assert_eq!(progress, vec![None, Some(100)]);
    }
}

#[test]
fn incomplete_download_does_not_report_completion() {
    let mut progress = Vec::new();
    let result = download_bytes(Cursor::new(b"partial"), Some(100), |percent| {
        progress.push(percent);
        Ok(())
    });

    assert!(result.unwrap_err().contains("incomplete"));
    assert!(!progress.contains(&Some(100)));
}

#[test]
fn download_read_errors_are_reported() {
    struct BrokenReader;
    impl Read for BrokenReader {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::other("connection interrupted"))
        }
    }

    let error = download_bytes(BrokenReader, None, |_| Ok(())).unwrap_err();
    assert!(error.contains("Could not download ExifTool"));
    assert!(error.contains("connection interrupted"));
}

#[test]
fn progress_delivery_errors_are_reported() {
    let error = download_bytes(Cursor::new(b"archive"), None, |_| {
        Err("channel closed".to_string())
    })
    .unwrap_err();
    assert_eq!(error, "channel closed");
}

#[test]
fn progress_payload_matches_the_frontend_contract() {
    for (stage, name) in [
        (ExiftoolInstallStage::Downloading, "downloading"),
        (ExiftoolInstallStage::Unpacking, "unpacking"),
        (ExiftoolInstallStage::Checking, "checking"),
    ] {
        let payload = serde_json::to_value(ExiftoolInstallProgress {
            stage,
            version: Some("13.59".to_string()),
            percent: None,
        })
        .unwrap();
        assert_eq!(
            payload,
            serde_json::json!({ "stage": name, "version": "13.59", "percent": null })
        );
    }
}

#[test]
fn extraction_reports_progress_and_renames_the_executable() {
    use std::io::Write;

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("exiftool-13.59_64/exiftool(-k).exe", options)
        .unwrap();
    zip.write_all(b"executable").unwrap();
    zip.start_file("exiftool-13.59_64/exiftool_files/perl.exe", options)
        .unwrap();
    zip.write_all(b"perl").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dest = env::temp_dir().join(format!(
        "photokin-exiftool-test-{}-{unique}",
        std::process::id()
    ));
    let mut progress = Vec::new();
    let result = extract(bytes, &dest, |percent| {
        progress.push(percent);
        Ok(())
    });
    let executable = fs::read(dest.join("exiftool.exe"));
    let perl = fs::read(dest.join("exiftool_files").join("perl.exe"));
    fs::remove_dir_all(&dest).unwrap();

    result.unwrap();
    assert_eq!(executable.unwrap(), b"executable");
    assert_eq!(perl.unwrap(), b"perl");
    assert_eq!(progress.first(), Some(&0));
    assert!(progress.contains(&50));
    assert_eq!(progress.last(), Some(&100));
}
