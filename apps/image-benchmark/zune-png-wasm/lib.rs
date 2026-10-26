//! zune-png behind a minimal C ABI, so the png-wasm benchmark can load it with
//! plain `WebAssembly.instantiate` (zune ships no wasm package). The caller
//! copies input in through `alloc`, calls `decode` / `encode`, then copies the
//! result out of `out_ptr()`, which matches what wasm-bindgen glue does.

use std::cell::RefCell;

use zune_core::bit_depth::BitDepth;
use zune_core::bytestream::ZCursor;
use zune_core::colorspace::ColorSpace;
use zune_core::options::{DecoderOptions, EncoderOptions};
use zune_core::result::DecodingResult;
use zune_png::{PngDecoder, PngEncoder};

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` and `len` must come from one `alloc` call.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|out| out.borrow().as_ptr())
}

/// Decodes to 8-bit samples with an alpha channel added (RGBA8 for color
/// images) and returns the byte length at `out_ptr()`, or 0 on error.
///
/// # Safety
/// `ptr` must point to `len` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn decode(ptr: *const u8, len: usize) -> usize {
    let bytes = std::slice::from_raw_parts(ptr, len);
    let options = DecoderOptions::default()
        .png_set_add_alpha_channel(true)
        .png_set_strip_to_8bit(true);
    let pixels = match PngDecoder::new_with_options(ZCursor::new(bytes), options).decode() {
        Ok(DecodingResult::U8(pixels)) => pixels,
        _ => return 0,
    };
    let n = pixels.len();
    OUT.with(|out| *out.borrow_mut() = pixels);
    n
}

/// Encodes RGBA8 pixels and returns the PNG byte length at `out_ptr()`, or 0
/// on error. zune-png writes stored (uncompressed) deflate only.
///
/// # Safety
/// `ptr` must point to `width * height * 4` readable bytes.
#[no_mangle]
pub unsafe extern "C" fn encode(ptr: *const u8, width: usize, height: usize) -> usize {
    let pixels = std::slice::from_raw_parts(ptr, width * height * 4);
    let options = EncoderOptions::new(width, height, ColorSpace::RGBA, BitDepth::Eight);
    let mut png = Vec::new();
    if PngEncoder::new(pixels, options).encode(&mut png).is_err() {
        return 0;
    }
    let n = png.len();
    OUT.with(|out| *out.borrow_mut() = png);
    n
}
