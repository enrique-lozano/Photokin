use super::{probe, MAX_METADATA_BYTES, MAX_TOP_LEVEL_BOXES};
use mp4::{BoxHeader, BoxType, FtypBox, Mp4Reader, WriteBox};
use std::io::{Cursor, Read, Seek, SeekFrom};

#[test]
fn reads_demo_video_geometry() {
    let bytes = include_bytes!("../../../demo/images/bunny.mp4");
    let (width, height, orientation) = probe(Cursor::new(bytes), bytes.len() as u64).unwrap();
    assert!(width > 0 && height > 0);
    assert_eq!(orientation, 1);
}

#[test]
fn malformed_video_falls_back() {
    for bytes in [Vec::new(), b"not an mp4".to_vec(), vec![0; 32]] {
        assert_eq!(probe(Cursor::new(&bytes), bytes.len() as u64), None);
    }
}

fn metadata(matrix: (i32, i32, i32, i32)) -> Vec<u8> {
    let demo = include_bytes!("../../../demo/images/bunny.mp4");
    let mut movie = Mp4Reader::read_header(Cursor::new(demo), demo.len() as u64).unwrap();
    let transform = &mut movie.moov.traks[0].tkhd.matrix;
    (transform.a, transform.b, transform.c, transform.d) = matrix;
    let mut bytes = Vec::new();
    FtypBox::default().write_box(&mut bytes).unwrap();
    movie.moov.write_box(&mut bytes).unwrap();
    bytes
}

#[test]
fn returns_display_dimensions_for_rotations() {
    let bytes = metadata((65_536, 0, 0, 65_536));
    let (width, height, _) = probe(Cursor::new(&bytes), bytes.len() as u64).unwrap();
    for (matrix, expected) in [
        ((0, 65_536, -65_536, 0), (height, width, 1)),
        ((-65_536, 0, 0, -65_536), (width, height, 1)),
        ((0, -65_536, 65_536, 0), (height, width, 1)),
    ] {
        let rotated = metadata(matrix);
        assert_eq!(
            probe(Cursor::new(&rotated), rotated.len() as u64),
            Some(expected)
        );
    }
    let unsupported = metadata((65_536, 100, 100, 65_536));
    assert_eq!(
        probe(Cursor::new(&unsupported), unsupported.len() as u64),
        None
    );
}

struct CountingReader {
    cursor: Cursor<Vec<u8>>,
    bytes_read: usize,
}

impl Read for CountingReader {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let count = self.cursor.read(buffer)?;
        self.bytes_read += count;
        Ok(count)
    }
}

impl Seek for CountingReader {
    fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
        self.cursor.seek(position)
    }
}

#[test]
fn skips_media_payload_before_metadata_including_extended_headers() {
    for extended in [false, true] {
        let mut bytes = Vec::new();
        FtypBox::default().write_box(&mut bytes).unwrap();
        let payload_size = 8 * 1024 * 1024;
        if extended {
            bytes.extend_from_slice(&1u32.to_be_bytes());
            bytes.extend_from_slice(b"mdat");
            bytes.extend_from_slice(&(payload_size + 16u64).to_be_bytes());
        } else {
            BoxHeader::new(BoxType::MdatBox, payload_size + 8)
                .write(&mut bytes)
                .unwrap();
        }
        bytes.resize(bytes.len() + payload_size as usize, 0);
        let mut movie = metadata((0, 65_536, -65_536, 0));
        let ftyp = BoxHeader::read(&mut Cursor::new(&movie)).unwrap();
        bytes.extend_from_slice(&movie.split_off(ftyp.size as usize));
        let size = bytes.len() as u64;
        let mut reader = CountingReader {
            cursor: Cursor::new(bytes),
            bytes_read: 0,
        };
        let (width, height, _) = probe(&mut reader, size).unwrap();
        assert!(height > width);
        assert!(reader.bytes_read < MAX_METADATA_BYTES as usize);
    }
}

#[test]
fn oversized_metadata_is_not_read() {
    let mut bytes = Vec::new();
    BoxHeader::new(BoxType::MoovBox, MAX_METADATA_BYTES + 1)
        .write(&mut bytes)
        .unwrap();
    let mut reader = CountingReader {
        cursor: Cursor::new(bytes),
        bytes_read: 0,
    };
    assert_eq!(probe(&mut reader, MAX_METADATA_BYTES + 1), None);
    assert_eq!(reader.bytes_read, 8);
}

#[test]
fn limits_top_level_scanning() {
    let mut bytes = Vec::new();
    for _ in 0..=MAX_TOP_LEVEL_BOXES {
        BoxHeader::new(BoxType::FreeBox, 8)
            .write(&mut bytes)
            .unwrap();
    }
    let size = bytes.len() as u64;
    let mut reader = CountingReader {
        cursor: Cursor::new(bytes),
        bytes_read: 0,
    };
    assert_eq!(probe(&mut reader, size), None);
    assert_eq!(reader.bytes_read, MAX_TOP_LEVEL_BOXES * 8);
}
