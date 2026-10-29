use super::*;
use std::path::Path;

#[test]
fn nearest_existing_returns_self_when_present() {
    let tmp = std::env::temp_dir();
    assert_eq!(nearest_existing(&tmp), Some(tmp.as_path()));
}

#[test]
fn nearest_existing_walks_up_missing_children() {
    let tmp = std::env::temp_dir();
    let missing = tmp.join("photokin-missing-dir").join("also-missing");
    assert_eq!(nearest_existing(&missing), Some(tmp.as_path()));
}

#[test]
fn nearest_existing_none_for_empty_path() {
    assert_eq!(nearest_existing(Path::new("")), None);
}
