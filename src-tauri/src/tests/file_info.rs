use super::*;
use std::fs;

#[test]
fn stat_of_reports_size_and_file_flag() {
    let path = std::env::temp_dir().join(format!("photokin-filestat-{}", std::process::id()));
    fs::write(&path, b"hello").unwrap();
    let metadata = fs::metadata(&path).unwrap();
    let stat = stat_of(&path, &metadata);
    let _ = fs::remove_file(&path);

    assert_eq!(stat.size, 5);
    assert!(stat.is_file);
    assert!(!stat.is_dir);
    assert!(stat.mtime.is_some());
}

#[test]
fn stat_of_serializes_camel_case_flags() {
    let dir = std::env::temp_dir();
    let metadata = fs::metadata(&dir).unwrap();
    let json = serde_json::to_value(stat_of(&dir, &metadata)).unwrap();

    assert_eq!(json["isDir"], true);
    assert_eq!(json["isFile"], false);
}
