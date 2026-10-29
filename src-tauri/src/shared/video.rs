use mp4::{BoxHeader, BoxType, Mp4Reader, TrackType};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

const MAX_METADATA_BYTES: u64 = 256 * 1024;
const MAX_TOP_LEVEL_BOXES: usize = 256;

pub fn probe_video(path: &Path, size: u64) -> Option<(u32, u32, u8)> {
    probe(BufReader::new(File::open(path).ok()?), size)
}

fn probe<R: Read + Seek>(mut reader: R, size: u64) -> Option<(u32, u32, u8)> {
    for _ in 0..MAX_TOP_LEVEL_BOXES {
        let start = reader.stream_position().ok()?;
        if start >= size {
            return None;
        }
        let header = BoxHeader::read(&mut reader).ok()?;
        let header_bytes = reader.stream_position().ok()?.checked_sub(start)?;
        let end = start
            .checked_add(header.size)?
            .checked_add(header_bytes.checked_sub(8)?)?;
        if header.size < 8 || end > size {
            return None;
        }
        if header.name == BoxType::MoovBox {
            if header.size > MAX_METADATA_BYTES {
                return None;
            }
            reader.rewind().ok()?;
            let movie = Mp4Reader::read_header(reader, end).ok()?;
            let track = movie
                .moov
                .traks
                .iter()
                .filter_map(|track| movie.tracks().get(&track.tkhd.track_id))
                .find(|track| matches!(track.track_type(), Ok(TrackType::Video)))?;
            let width = u32::from(track.width());
            let height = u32::from(track.height());
            if width == 0 || height == 0 {
                return None;
            }
            let matrix = &track.trak.tkhd.matrix;
            // Videos store display dimensions with orientation 1, as the ExifTool pipeline does.
            return match (matrix.a, matrix.b, matrix.c, matrix.d) {
                (65_536, 0, 0, 65_536) | (-65_536, 0, 0, -65_536) => Some((width, height, 1)),
                (0, 65_536, -65_536, 0) | (0, -65_536, 65_536, 0) => Some((height, width, 1)),
                _ => None,
            };
        }
        if !matches!(
            header.name,
            BoxType::FtypBox | BoxType::MdatBox | BoxType::FreeBox
        ) {
            return None;
        }
        if header.name == BoxType::FtypBox && header.size > MAX_METADATA_BYTES {
            return None;
        }
        reader.seek(SeekFrom::Start(end)).ok()?;
    }
    None
}

#[cfg(test)]
#[path = "../tests/video.rs"]
mod tests;
