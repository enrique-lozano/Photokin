use super::*;
use std::path::Path;

#[test]
fn cache_files_follow_shard_layout() {
    let [full, xs, preview] = cache_files(Path::new("/thumbs"), "abcdef");
    assert!(full.ends_with("ab/abcdef.webp") || full.ends_with("ab\\abcdef.webp"));
    assert!(xs.ends_with("ab/XS__abcdef.webp") || xs.ends_with("ab\\XS__abcdef.webp"));
    assert!(preview.ends_with("PREVIEW__abcdef.webp"));
}
