use super::*;

#[test]
fn first_non_empty_line_skips_blank_lines() {
    assert_eq!(first_non_empty_line(b"\n  \n12.76\n"), Some("12.76".into()));
    assert_eq!(first_non_empty_line(b"   \n"), None);
}
