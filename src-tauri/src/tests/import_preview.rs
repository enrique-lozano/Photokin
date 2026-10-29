use super::*;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

fn write_file(path: &Path, bytes: &[u8]) {
    File::create(path).unwrap().write_all(bytes).unwrap();
}

#[test]
fn extension_matches_js() {
    assert_eq!(extension("Photo.JPG"), ".jpg");
    assert_eq!(extension("noext"), "");
    assert_eq!(extension("archive.tar.gz"), ".gz");
}

#[test]
fn counts_nested_files() {
    let root = std::env::temp_dir().join(format!("photokin-scan-preview-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("sub")).unwrap();
    write_file(&root.join("a.jpg"), b"xx");
    write_file(&root.join("sub").join("b.png"), b"yyy");
    write_file(&root.join("notes.txt"), b"z");

    let result = scan_roots(
        vec![root.to_string_lossy().into()],
        vec![".jpg".into(), ".png".into()],
    )
    .unwrap();
    let _ = fs::remove_dir_all(&root);

    assert_eq!(result.supported_files_count, 2);
    assert_eq!(result.unsupported_files_count, 1);
    assert_eq!(result.supported_files_size, 5);
    assert_eq!(result.directories_with_supported_files.len(), 1);
    assert_eq!(result.unsupported_extensions[0].extension, ".txt");
}
