//! Adapters that drive each codec through a single decode / encode call, so
//! the harness can time them uniformly.
//!
//! - **Decode** measures each codec's idiomatic full decode. blazediff and
//!   spng always emit RGBA8 (their only output mode); image-rs and zune emit
//!   the image's native pixel layout. We compare "PNG bytes → pixels" at each
//!   library's natural fast path, not a forced common format.
//! - **Encode** is strictly apples-to-apples: every codec is handed the same
//!   RGBA8 buffer (blazediff's decode of the fixture) and asked to write a
//!   PNG at its balanced/default compression. Output size is reported
//!   alongside time so the speed/ratio trade-off is visible.

use blazediff::spng_ffi::*;
use blazediff_png::{ColorMode, EncodeOptions, Filter, Image};
use png::DeflateCompression;
use std::os::raw::c_int;

/// Display names, indexed the same as [`decode`] / [`encode`].
pub const NAMES: [&str; 4] = ["blazediff", "spng", "image-rs", "zune"];

/// Encode compression mode. We time each codec at two settings so the
/// speed/size trade-off is visible and zune's compress-nothing encoder is
/// measured on equal footing:
///   - [`EncMode::None`] — stored / uncompressed deflate blocks (level 0).
///   - [`EncMode::Half`] — half of each codec's *own* max deflate level
///     (libdeflate 12 → 6, zlib 9 → 4). zune only supports stored output, so
///     its `Half` is the same uncompressed encode.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EncMode {
    None,
    Half,
}

/// The deflate level/strategy each codec runs for `mode`, for display.
pub fn level_label(idx: usize, mode: EncMode) -> &'static str {
    match (idx, mode) {
        (_, EncMode::None) => "stored",
        (0, EncMode::Half) => "libdeflate 6",
        (1, EncMode::Half) => "zlib 4",
        (2, EncMode::Half) => "flate2 4",
        (3, EncMode::Half) => "stored", // zune has no compressed mode
        _ => unreachable!(),
    }
}

struct CtxGuard(*mut spng_ctx);
impl Drop for CtxGuard {
    fn drop(&mut self) {
        unsafe { spng_ctx_free(self.0) }
    }
}

/// Decode fixture `bytes` with codec `idx`, returning the decoded buffer's
/// byte length (kept live so the work isn't optimized away).
pub fn decode(idx: usize, bytes: &[u8]) -> usize {
    match idx {
        0 => blazediff_png::decode(bytes)
            .expect("blazediff decode")
            .data
            .len(),
        1 => spng_decode(bytes).2.len(),
        2 => image_decode(bytes),
        3 => zune_decode(bytes),
        _ => unreachable!(),
    }
}

/// Encode the RGBA8 `img` with codec `idx` at `mode`, returning the PNG bytes.
pub fn encode(idx: usize, img: &Image, mode: EncMode) -> Vec<u8> {
    match idx {
        0 => bd_encode(img, mode),
        1 => spng_encode(img, mode),
        2 => image_encode(img, mode),
        3 => zune_encode(img),
        _ => unreachable!(),
    }
}

// --- blazediff ---------------------------------------------------------------

fn bd_encode(img: &Image, mode: EncMode) -> Vec<u8> {
    // libdeflate levels 0..=12; "half" of the max is 6, "none" is stored (0).
    let compression = match mode {
        EncMode::None => 0,
        EncMode::Half => 6,
    };
    blazediff_png::encode(
        img,
        &EncodeOptions {
            color: ColorMode::Rgba8,
            compression,
            filter: if compression == 0 {
                Filter::None
            } else {
                Filter::Adaptive
            },
            interlace: false,
        },
    )
    .expect("blazediff encode")
}

// --- spng (the exact libspng blazediff links) --------------------------------

/// spng decode → (width, height, RGBA8 bytes), `FMT_RGBA8 + TRNS`, matching
/// blazediff's decoder configuration exactly.
pub fn spng_decode(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_IGNORE_ADLER32 as c_int);
        assert!(!ctx.is_null());
        let _guard = CtxGuard(ctx);
        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as c_int,
            spng_crc_action_SPNG_CRC_USE as c_int,
        );
        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);
        assert_eq!(
            spng_set_png_buffer(ctx, bytes.as_ptr() as *const _, bytes.len()),
            0
        );
        let mut ihdr: spng_ihdr = std::mem::zeroed();
        assert_eq!(spng_get_ihdr(ctx, &mut ihdr), 0);
        let mut out_size = 0usize;
        assert_eq!(
            spng_decoded_image_size(ctx, spng_format_SPNG_FMT_RGBA8 as c_int, &mut out_size),
            0
        );
        let mut data = vec![0u8; out_size];
        assert_eq!(
            spng_decode_image(
                ctx,
                data.as_mut_ptr() as *mut _,
                out_size,
                spng_format_SPNG_FMT_RGBA8 as c_int,
                spng_decode_flags_SPNG_DECODE_TRNS as c_int,
            ),
            0
        );
        (ihdr.width, ihdr.height, data)
    }
}

fn spng_encode(img: &Image, mode: EncMode) -> Vec<u8> {
    // zlib levels 0..=9; "half" of the max is 4, "none" is stored (0).
    let level: c_int = match mode {
        EncMode::None => 0,
        EncMode::Half => 4,
    };
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        assert!(!ctx.is_null());
        let mut ihdr = spng_ihdr {
            width: img.width,
            height: img.height,
            bit_depth: 8,
            color_type: spng_color_type_SPNG_COLOR_TYPE_TRUECOLOR_ALPHA as u8,
            compression_method: 0,
            filter_method: 0,
            interlace_method: 0,
        };
        assert_eq!(spng_set_ihdr(ctx, &mut ihdr), 0);
        spng_set_option(ctx, spng_option_SPNG_ENCODE_TO_BUFFER, 1);
        spng_set_option(ctx, spng_option_SPNG_IMG_COMPRESSION_LEVEL, level);
        if level == 0 {
            // Match the "no compression" intent: don't filter before storing
            // (restrict the adaptive choice to the None filter).
            spng_set_option(
                ctx,
                spng_option_SPNG_FILTER_CHOICE,
                spng_filter_choice_SPNG_FILTER_CHOICE_NONE as c_int,
            );
        }

        let ret = spng_encode_image(
            ctx,
            img.data.as_ptr() as *const _,
            img.data.len(),
            spng_format_SPNG_FMT_PNG as c_int,
            spng_encode_flags_SPNG_ENCODE_FINALIZE as c_int,
        );
        assert_eq!(ret, 0, "spng_encode_image");

        let mut len = 0usize;
        let mut err = 0 as c_int;
        let buf = spng_get_png_buffer(ctx, &mut len, &mut err);
        assert!(!buf.is_null() && err == 0);
        let out = std::slice::from_raw_parts(buf as *const u8, len).to_vec();
        libc::free(buf as *mut _);
        spng_ctx_free(ctx);
        out
    }
}

// --- image-rs `png` ----------------------------------------------------------

fn image_decode(bytes: &[u8]) -> usize {
    let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    let mut reader = decoder.read_info().expect("image-rs read_info");
    let mut buf = vec![0u8; reader.output_buffer_size().expect("image-rs buffer size")];
    let info = reader.next_frame(&mut buf).expect("image-rs decode");
    info.buffer_size()
}

fn image_encode(img: &Image, mode: EncMode) -> Vec<u8> {
    // flate2/zlib levels 1..=9 (`Level`); "half" of the max is 4, "none" is the
    // crate's stored mode (which also forces no row filtering).
    let compression = match mode {
        EncMode::None => DeflateCompression::NoCompression,
        EncMode::Half => DeflateCompression::Level(4),
    };
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, img.width, img.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_deflate_compression(compression);
        let mut writer = encoder.write_header().expect("image-rs header");
        writer.write_image_data(&img.data).expect("image-rs encode");
    }
    out
}

// --- zune-png ----------------------------------------------------------------

fn zune_decode(bytes: &[u8]) -> usize {
    use zune_core::bytestream::ZCursor;
    use zune_core::result::DecodingResult;
    let mut decoder = zune_png::PngDecoder::new(ZCursor::new(bytes));
    match decoder.decode().expect("zune decode") {
        DecodingResult::U8(v) => v.len(),
        DecodingResult::U16(v) => v.len() * 2,
        _ => 0,
    }
}

fn zune_encode(img: &Image) -> Vec<u8> {
    use zune_core::bit_depth::BitDepth;
    use zune_core::colorspace::ColorSpace;
    use zune_core::options::EncoderOptions;
    let options = EncoderOptions::new(
        img.width as usize,
        img.height as usize,
        ColorSpace::RGBA,
        BitDepth::Eight,
    );
    let mut encoder = zune_png::PngEncoder::new(&img.data, options);
    let mut out = Vec::new();
    encoder.encode(&mut out).expect("zune encode");
    out
}
