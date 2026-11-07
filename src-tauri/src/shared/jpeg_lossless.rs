//! Lossless JPEG crop, rotate and flip.
//!
//! libjpeg's transform code moves quantized DCT blocks around instead of decoding
//! and re-compressing pixels, so the result is pixel-identical to the source for
//! every block it keeps. Crops snap to the JPEG block grid (8 or 16 px), and
//! rotations/flips drop up to 15 px of partial edge blocks that cannot be moved.

use mozjpeg_sys::*;
use std::mem;
use std::os::raw::{c_int, c_uint, c_ulong};
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};

const JCROP_POS: c_uint = 1;
const SINK_CHUNK: usize = 1 << 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// A rotation/flip as a signed permutation matrix mapping source coordinates to
/// output coordinates (y grows downward), so transforms compose by multiplication.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Dihedral([[i8; 2]; 2]);

impl Dihedral {
    pub const IDENTITY: Self = Self([[1, 0], [0, 1]]);
    const FLIP_H: Self = Self([[-1, 0], [0, 1]]);
    const FLIP_V: Self = Self([[1, 0], [0, -1]]);
    const ROTATE_90: Self = Self([[0, -1], [1, 0]]);

    /// Apply `self` first, then `next`.
    pub fn then(self, next: Self) -> Self {
        let (a, b) = (next.0, self.0);
        let mut out = [[0i8; 2]; 2];
        for (row, out_row) in out.iter_mut().enumerate() {
            for (column, cell) in out_row.iter_mut().enumerate() {
                *cell = (0..2).map(|k| a[row][k] * b[k][column]).sum();
            }
        }
        Self(out)
    }

    /// The transform that displays pixels stored with this EXIF orientation upright.
    pub fn from_exif_orientation(orientation: u8) -> Self {
        let rotate = |turns: u8| (0..turns).fold(Self::IDENTITY, |acc, _| acc.then(Self::ROTATE_90));
        match orientation {
            2 => Self::FLIP_H,
            3 => rotate(2),
            4 => Self::FLIP_V,
            5 => rotate(1).then(Self::FLIP_H),
            6 => rotate(1),
            7 => rotate(1).then(Self::FLIP_V),
            8 => rotate(3),
            _ => Self::IDENTITY,
        }
    }

    /// Clockwise quarter turns, then a horizontal flip, then a vertical flip.
    pub fn from_edit(turns: u8, flip_horizontal: bool, flip_vertical: bool) -> Self {
        let mut result = (0..turns % 4).fold(Self::IDENTITY, |acc, _| acc.then(Self::ROTATE_90));
        if flip_horizontal {
            result = result.then(Self::FLIP_H);
        }
        if flip_vertical {
            result = result.then(Self::FLIP_V);
        }
        result
    }

    fn swaps_axes(self) -> bool {
        self.0[0][0] == 0
    }

    fn code(self) -> c_uint {
        match self.0 {
            [[1, 0], [0, 1]] => 0,
            [[-1, 0], [0, 1]] => 1,
            [[1, 0], [0, -1]] => 2,
            [[0, 1], [1, 0]] => 3,
            [[0, -1], [-1, 0]] => 4,
            [[0, -1], [1, 0]] => 5,
            [[-1, 0], [0, -1]] => 6,
            _ => 7,
        }
    }

    /// Output axes (0 = x, 1 = y) where the source's right and bottom partial
    /// blocks end up at the leading edge, which libjpeg cannot keep.
    fn leading_axes(self) -> (Option<usize>, Option<usize>) {
        match self.code() {
            1 => (Some(0), None),
            2 => (None, Some(1)),
            4 => (Some(1), Some(0)),
            5 => (None, Some(0)),
            6 => (Some(0), Some(1)),
            7 => (Some(1), None),
            _ => (None, None),
        }
    }
}

// Mirrors `jpeg_transform_info` in the vendored transupp.h. The sys crate's own
// binding predates the `drop_*` fields, so it cannot be used to allocate the struct.
#[repr(C)]
struct TransformInfo {
    transform: c_uint,
    perfect: c_int,
    trim: c_int,
    force_grayscale: c_int,
    crop: c_int,
    slow_hflip: c_int,
    crop_width: u32,
    crop_width_set: c_uint,
    crop_height: u32,
    crop_height_set: c_uint,
    crop_xoffset: u32,
    crop_xoffset_set: c_uint,
    crop_yoffset: u32,
    crop_yoffset_set: c_uint,
    drop_ptr: *mut jpeg_decompress_struct,
    drop_coef_arrays: *mut jvirt_barray_ptr,
    num_components: c_int,
    workspace_coef_arrays: *mut jvirt_barray_ptr,
    output_width: u32,
    output_height: u32,
    x_crop_offset: u32,
    y_crop_offset: u32,
    drop_width: u32,
    drop_height: u32,
    imcu_sample_width: c_int,
    imcu_sample_height: c_int,
}

struct JpegFailure(c_int);

unsafe extern "C-unwind" fn fail(cinfo: &mut jpeg_common_struct) {
    resume_unwind(Box::new(JpegFailure((*cinfo.err).msg_code)));
}

unsafe extern "C-unwind" fn ignore_message(_: &mut jpeg_common_struct, _: c_int) {}

unsafe extern "C-unwind" fn ignore_output(_: &mut jpeg_common_struct) {}

#[repr(C)]
struct Sink {
    manager: jpeg_destination_mgr,
    chunk: Vec<u8>,
    output: Vec<u8>,
}

unsafe fn sink_of(cinfo: &mut jpeg_compress_struct) -> &mut Sink {
    // `manager` is the first field of the repr(C) `Sink` that `dest` points into.
    &mut *(cinfo.dest as *mut Sink)
}

unsafe extern "C-unwind" fn sink_start(cinfo: &mut jpeg_compress_struct) {
    let sink = sink_of(cinfo);
    sink.manager.next_output_byte = sink.chunk.as_mut_ptr();
    sink.manager.free_in_buffer = sink.chunk.len();
}

unsafe extern "C-unwind" fn sink_flush(cinfo: &mut jpeg_compress_struct) -> boolean {
    let sink = sink_of(cinfo);
    sink.output.extend_from_slice(&sink.chunk);
    sink.manager.next_output_byte = sink.chunk.as_mut_ptr();
    sink.manager.free_in_buffer = sink.chunk.len();
    1
}

unsafe extern "C-unwind" fn sink_finish(cinfo: &mut jpeg_compress_struct) {
    let sink = sink_of(cinfo);
    let used = sink.chunk.len() - sink.manager.free_in_buffer;
    sink.output.extend_from_slice(&sink.chunk[..used]);
}

struct Libjpeg {
    error: Box<jpeg_error_mgr>,
    source: Box<jpeg_decompress_struct>,
    target: Box<jpeg_compress_struct>,
    sink: Box<Sink>,
    source_ready: bool,
    target_ready: bool,
}

impl Libjpeg {
    fn new() -> Self {
        // SAFETY: these C structs are plain data (integers, floats, raw pointers
        // and nullable callbacks); libjpeg expects them zero-filled before create.
        unsafe {
            let mut lib = Self {
                error: Box::new(mem::zeroed()),
                source: Box::new(mem::zeroed()),
                target: Box::new(mem::zeroed()),
                sink: Box::new(Sink {
                    manager: mem::zeroed(),
                    chunk: vec![0; SINK_CHUNK],
                    output: Vec::new(),
                }),
                source_ready: false,
                target_ready: false,
            };
            jpeg_std_error(&mut lib.error);
            lib.error.error_exit = Some(fail);
            lib.error.emit_message = Some(ignore_message);
            lib.error.output_message = Some(ignore_output);
            let error: *mut jpeg_error_mgr = &mut *lib.error;
            lib.source.common.err = error;
            lib.target.common.err = error;
            lib.sink.manager.init_destination = Some(sink_start);
            lib.sink.manager.empty_output_buffer = Some(sink_flush);
            lib.sink.manager.term_destination = Some(sink_finish);
            lib
        }
    }
}

impl Drop for Libjpeg {
    fn drop(&mut self) {
        // SAFETY: only objects that were successfully created are destroyed.
        unsafe {
            if self.source_ready {
                jpeg_destroy_decompress(&mut self.source);
            }
            if self.target_ready {
                jpeg_destroy_compress(&mut self.target);
            }
        }
    }
}

pub fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0xFF, 0xD8, 0xFF])
}

/// The area a lossless transform would produce, in the coordinates of the fully
/// transformed photo. Only reads the JPEG header, so a prefix of the file is enough.
pub fn plan(source: &[u8], transform: Dihedral, crop: Rect) -> Result<Rect, String> {
    run(source, transform, crop, false).map(|(_, rect)| rect)
}

/// Crop, rotate and flip without re-compressing. Returns the JPEG and the area of
/// the transformed photo it contains, which may extend the crop to the block grid.
pub fn transform(
    source: &[u8],
    transform: Dihedral,
    crop: Rect,
) -> Result<(Vec<u8>, Rect), String> {
    run(source, transform, crop, true)
}

fn run(
    source: &[u8],
    transform: Dihedral,
    crop: Rect,
    execute: bool,
) -> Result<(Vec<u8>, Rect), String> {
    if !is_jpeg(source) {
        return Err("Lossless editing needs a JPEG photo".into());
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: libjpeg reports failures by unwinding through `fail`, and every
        // pointer handed to it points into `lib` or `source`, which outlive the call.
        unsafe { run_unchecked(source, transform, crop, execute) }
    }))
    .unwrap_or_else(|payload| match payload.downcast::<JpegFailure>() {
        Ok(failure) => Err(format!(
            "This JPEG cannot be edited losslessly (libjpeg error {})",
            failure.0
        )),
        Err(other) => resume_unwind(other),
    })
}

unsafe fn run_unchecked(
    source: &[u8],
    transform: Dihedral,
    crop: Rect,
    execute: bool,
) -> Result<(Vec<u8>, Rect), String> {
    let mut lib = Libjpeg::new();
    jpeg_create_decompress(&mut *lib.source);
    lib.source_ready = true;
    jpeg_mem_src(&mut lib.source, source.as_ptr(), source.len() as c_ulong);
    if jpeg_read_header(&mut lib.source, 1) != 1 {
        return Err("The JPEG header is incomplete".into());
    }

    let (width, height) = (lib.source.image_width, lib.source.image_height);
    let (mcu_width, mcu_height) = if lib.source.num_components == 1 {
        (8, 8)
    } else {
        (
            lib.source.max_h_samp_factor as u32 * 8,
            lib.source.max_v_samp_factor as u32 * 8,
        )
    };
    let (output_width, output_height) = if transform.swaps_axes() {
        (height, width)
    } else {
        (width, height)
    };
    if crop.width == 0
        || crop.height == 0
        || crop.x.checked_add(crop.width).is_none_or(|right| right > output_width)
        || crop.y.checked_add(crop.height).is_none_or(|bottom| bottom > output_height)
    {
        return Err("Crop is outside the photo".into());
    }

    // Partial blocks on the source's right/bottom edge are copied unchanged, so
    // they are only usable where the transform leaves them on a trailing edge.
    let mut lead = [0u32; 2];
    let (right_axis, bottom_axis) = transform.leading_axes();
    if let Some(axis) = right_axis {
        lead[axis] += width % mcu_width;
    }
    if let Some(axis) = bottom_axis {
        lead[axis] += height % mcu_height;
    }
    let left = crop.x.max(lead[0]);
    let top = crop.y.max(lead[1]);
    let right = crop.x + crop.width;
    let bottom = crop.y + crop.height;
    if left >= right || top >= bottom {
        return Err("The crop only covers edge pixels that cannot be moved losslessly".into());
    }

    let mut info: TransformInfo = mem::zeroed();
    info.transform = transform.code();
    info.trim = 1;
    info.crop = 1;
    info.crop_xoffset = left - lead[0];
    info.crop_xoffset_set = JCROP_POS;
    info.crop_yoffset = top - lead[1];
    info.crop_yoffset_set = JCROP_POS;
    info.crop_width = right - left;
    info.crop_width_set = JCROP_POS;
    info.crop_height = bottom - top;
    info.crop_height_set = JCROP_POS;
    let info_ptr = &mut info as *mut TransformInfo as *mut jpeg_transform_info;
    let source_ptr: *mut jpeg_decompress_struct = &mut *lib.source;
    if jtransform_request_workspace(source_ptr, info_ptr) == 0 {
        return Err("The crop cannot be applied losslessly".into());
    }
    let planned = Rect {
        x: info.x_crop_offset * info.imcu_sample_width as u32 + lead[0],
        y: info.y_crop_offset * info.imcu_sample_height as u32 + lead[1],
        width: info.output_width,
        height: info.output_height,
    };
    if !execute {
        return Ok((Vec::new(), planned));
    }

    let coefficients = jpeg_read_coefficients(&mut lib.source);
    jpeg_create_compress(&mut *lib.target);
    lib.target_ready = true;
    let sink: *mut Sink = &mut *lib.sink;
    lib.target.dest = sink as *mut jpeg_destination_mgr;
    jpeg_copy_critical_parameters(&lib.source, &mut lib.target);
    let target_ptr: *mut jpeg_compress_struct = &mut *lib.target;
    let output_coefficients =
        jtransform_adjust_parameters(source_ptr, target_ptr, coefficients, info_ptr);
    // Optimal Huffman tables shrink the file without touching a single coefficient.
    lib.target.optimize_coding = 1;
    jpeg_write_coefficients(&mut lib.target, output_coefficients);
    jtransform_execute_transform(source_ptr, target_ptr, coefficients, info_ptr);
    jpeg_finish_compress(&mut lib.target);
    jpeg_finish_decompress(&mut lib.source);
    Ok((mem::take(&mut lib.sink.output), planned))
}

#[cfg(test)]
#[path = "../tests/jpeg_lossless.rs"]
mod tests;
