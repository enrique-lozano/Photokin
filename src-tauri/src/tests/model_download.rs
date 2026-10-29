use super::*;

#[test]
fn progress_is_weighted_by_bytes_when_sizes_are_known() {
    // 304 of 800 bytes, even though only the first of five files is in flight.
    assert_eq!(overall_fraction(304, 800, 0, 5, 0.9), 0.38);
}

#[test]
fn progress_falls_back_to_file_count_without_sizes() {
    assert_eq!(overall_fraction(0, 0, 2, 4, 0.5), 0.625);
}

#[test]
fn progress_never_exceeds_one() {
    assert_eq!(overall_fraction(900, 800, 4, 5, 1.0), 1.0);
}

#[test]
fn cancelling_without_a_running_download_is_a_no_op() {
    assert_eq!(cancel_model_download("not-running".into()), Ok(false));
    assert!(!is_cancel_requested("not-running"));
}

#[test]
fn cancelling_removes_every_file_written_for_the_model() {
    let root = std::env::temp_dir().join(format!("photokin-model-cancel-{}", std::process::id()));
    fs::create_dir_all(root.join("visual")).unwrap();
    fs::write(root.join("visual").join("model.onnx.part"), b"partial").unwrap();

    assert!(matches!(cancel_download(&root), Ok(DownloadOutcome::Cancelled)));
    assert!(!root.exists());
}
