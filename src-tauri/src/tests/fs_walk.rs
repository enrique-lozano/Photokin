use super::*;
use std::fs;

fn temp_tree(label: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("photokin-walk-{}-{label}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("trips/2026")).unwrap();
    fs::write(root.join("top.jpg"), b"a").unwrap();
    fs::write(root.join("trips/mid.HEIC"), b"b").unwrap();
    fs::write(root.join("trips/2026/deep.jpg"), b"c").unwrap();
    root
}

#[test]
fn extension_normalizes_case_and_missing_extensions() {
    assert_eq!(extension("IMG_1234.JPG"), ".jpg");
    assert_eq!(extension("archive.tar.gz"), ".gz");
    assert_eq!(extension("LICENSE"), "");
}

#[test]
fn walk_dirs_reaches_every_nested_file_once() {
    let root = temp_tree("nested");
    let mut names = Vec::new();

    walk_dirs(&root, &mut |_dir, files| {
        for file in files {
            names.push(file.file_name().to_string_lossy().into_owned());
        }
        Ok(())
    })
    .unwrap();

    names.sort();
    assert_eq!(names, vec!["deep.jpg", "mid.HEIC", "top.jpg"]);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn walk_dirs_reports_the_directory_holding_each_batch() {
    let root = temp_tree("dirs");
    let mut visited = Vec::new();

    walk_dirs(&root, &mut |dir, files| {
        visited.push((dir.to_path_buf(), files.len()));
        Ok(())
    })
    .unwrap();

    // Every directory is visited, including the two that hold one file each.
    assert_eq!(visited.len(), 3);
    assert_eq!(visited.iter().map(|(_, count)| count).sum::<usize>(), 3);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn walk_dirs_stops_at_the_first_visitor_error() {
    let root = temp_tree("error");
    let mut batches = 0;

    let result = walk_dirs(&root, &mut |_dir, _files| {
        batches += 1;
        Err("channel closed".to_string())
    });

    assert_eq!(result, Err("channel closed".to_string()));
    assert_eq!(batches, 1);
    let _ = fs::remove_dir_all(&root);
}
