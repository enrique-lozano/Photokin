use super::*;

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
    assert_eq!(progress, vec![Some(0), Some(32), Some(65), Some(98), Some(99), Some(100)]);
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
        assert_eq!(payload, serde_json::json!({ "stage": name, "version": "13.59", "percent": null }));
    }
}

#[test]
fn extraction_reports_progress_and_renames_the_executable() {
    use std::io::Write;

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("exiftool-13.59_64/exiftool(-k).exe", options).unwrap();
    zip.write_all(b"executable").unwrap();
    zip.start_file("exiftool-13.59_64/exiftool_files/perl.exe", options).unwrap();
    zip.write_all(b"perl").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    let dest = env::temp_dir().join(format!("photokin-exiftool-test-{}-{unique}", std::process::id()));
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
