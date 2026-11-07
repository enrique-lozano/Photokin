//! Baseline JPEG encoding: sampling and Huffman optimization are independent controls.

use image::DynamicImage;
use mozjpeg_sys::*;
use serde::{Deserialize, Serialize};
use std::mem;
use std::os::raw::c_int;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum JpegSubsampling {
    #[default]
    #[serde(rename = "444")]
    S444,
    #[serde(rename = "422")]
    S422,
    #[serde(rename = "420")]
    S420,
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
    chunk: [u8; 65536],
    output: Vec<u8>,
}

unsafe fn sink_of(cinfo: &mut jpeg_compress_struct) -> &mut Sink {
    // The destination manager is the first field of this stable, boxed allocation.
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

struct Encoder {
    error: Box<jpeg_error_mgr>,
    target: Box<jpeg_compress_struct>,
    sink: Box<Sink>,
}

impl Encoder {
    unsafe fn new() -> Self {
        // SAFETY: libjpeg's C structs permit zero initialization before create.
        let mut encoder = Self {
            error: Box::new(mem::zeroed()),
            target: Box::new(mem::zeroed()),
            sink: Box::new(Sink {
                manager: mem::zeroed(),
                chunk: [0; 65536],
                output: Vec::new(),
            }),
        };
        jpeg_std_error(&mut encoder.error);
        encoder.error.error_exit = Some(fail);
        encoder.error.emit_message = Some(ignore_message);
        encoder.error.output_message = Some(ignore_output);
        encoder.target.common.err = &mut *encoder.error;
        // Destroy also handles partially initialized compressors after a create error.
        jpeg_create_compress(&mut *encoder.target);
        encoder.sink.manager.init_destination = Some(sink_start);
        encoder.sink.manager.empty_output_buffer = Some(sink_flush);
        encoder.sink.manager.term_destination = Some(sink_finish);
        encoder.target.dest = &mut encoder.sink.manager;
        encoder
    }
}

impl Drop for Encoder {
    fn drop(&mut self) {
        // SAFETY: the error manager and destination outlive the compressor.
        unsafe { jpeg_destroy_compress(&mut self.target) }
    }
}

pub fn encode(
    image: &DynamicImage,
    quality: u8,
    subsampling: JpegSubsampling,
    optimize: bool,
) -> Result<Vec<u8>, String> {
    if !(1..=100).contains(&quality) {
        return Err("Invalid photo quality".into());
    }
    if image.color().has_alpha() {
        return Err("Choose PNG or WebP to preserve transparency".into());
    }
    if image.color().bits_per_pixel() / image.color().channel_count() as u16 > 8 {
        return Err("Choose PNG to preserve this photo's high bit depth".into());
    }
    if image.width() == 0 || image.height() == 0 {
        return Err("Cannot encode an empty photo".into());
    }
    let grayscale = image.color() == image::ColorType::L8;
    let pixels = if grayscale {
        image.to_luma8().into_raw()
    } else {
        image.to_rgb8().into_raw()
    };
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: the owned pixels, compressor, error manager and sink stay alive
        // throughout the calls. C-unwind callbacks recover errors without longjmp.
        unsafe {
            let mut encoder = Encoder::new();
            let target = &mut *encoder.target;
            target.image_width = image.width();
            target.image_height = image.height();
            target.input_components = if grayscale { 1 } else { 3 };
            target.in_color_space = if grayscale { JCS_GRAYSCALE } else { JCS_RGB };
            // mozjpeg otherwise defaults to progressive + trellis, where changing
            // entropy optimization could also change quantized pixels.
            jpeg_c_set_int_param(
                target,
                J_INT_PARAM::JINT_COMPRESS_PROFILE,
                JCP_FASTEST as c_int,
            );
            jpeg_set_defaults(target);
            jpeg_set_quality(target, quality as c_int, 1);
            target.optimize_coding = i32::from(optimize);
            if !grayscale {
                let (horizontal, vertical) = match subsampling {
                    JpegSubsampling::S444 => (1, 1),
                    JpegSubsampling::S422 => (2, 1),
                    JpegSubsampling::S420 => (2, 2),
                };
                (*target.comp_info).h_samp_factor = horizontal;
                (*target.comp_info).v_samp_factor = vertical;
                for component in 1..3 {
                    (*target.comp_info.add(component)).h_samp_factor = 1;
                    (*target.comp_info.add(component)).v_samp_factor = 1;
                }
            }
            jpeg_start_compress(target, 1);
            let stride = image.width() as usize * target.input_components as usize;
            while target.next_scanline < target.image_height {
                let row = pixels.as_ptr().add(target.next_scanline as usize * stride);
                if jpeg_write_scanlines(target, &row, 1) != 1 {
                    return Err("JPEG encoder did not consume the photo row".into());
                }
            }
            jpeg_finish_compress(target);
            Ok(mem::take(&mut encoder.sink.output))
        }
    }))
    .unwrap_or_else(|payload| match payload.downcast::<JpegFailure>() {
        Ok(failure) => Err(format!("Cannot encode JPEG (libjpeg error {})", failure.0)),
        Err(other) => resume_unwind(other),
    })
}

#[cfg(test)]
#[path = "../tests/jpeg_encode.rs"]
mod tests;
