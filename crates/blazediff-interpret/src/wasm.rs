//! Browser-facing wasm-bindgen entry points.
//!
//! Buffers-only API: callers pre-decode images to RGBA8 bytes (via `<canvas>`,
//! `createImageBitmap`, `ImageDecoder`, etc.) and pass `Uint8Array`s in. No
//! PNG/JPEG decoders are bundled into the wasm artifact — that is what the
//! `io` feature is for, and it stays off here.

use crate::interpret_diff;
use blazediff::DiffOptions;
use blazediff_shared::Image;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn _start() {
    console_error_panic_hook::set_once();
}

/// Wrap the caller's RGBA bytes without copying them.
///
/// The parameter is taken by value for the same reason as in `blazediff`'s
/// `wasm.rs`: wasm-bindgen has already copied the JS typed array into a
/// wasm-side allocation, and an owned `Vec<u8>` parameter takes ownership of
/// exactly that allocation. Borrowing it as `&[u8]` and calling `to_vec()`
/// would copy every input buffer a second time.
fn image_from_vec(rgba: Vec<u8>, width: u32, height: u32, label: &str) -> Result<Image, JsError> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|v| v.checked_mul(4))
        .ok_or_else(|| JsError::new("width*height overflow"))?;
    if rgba.len() != expected {
        return Err(JsError::new(&format!(
            "{}: expected {} bytes (width*height*4), got {}",
            label,
            expected,
            rgba.len()
        )));
    }
    Ok(Image {
        data: rgba,
        width,
        height,
    })
}

fn copy_output(
    target: Option<js_sys::Uint8Array>,
    output: Option<&Image>,
    has_diff: bool,
) -> Result<(), JsError> {
    let (Some(target), Some(output)) = (target, output) else {
        return Ok(());
    };
    if target.length() as usize != output.data.len() {
        return Err(JsError::new(&format!(
            "out_diff: expected {} bytes, got {}",
            output.data.len(),
            target.length()
        )));
    }
    if has_diff {
        target.copy_from(&output.data);
    }
    Ok(())
}

/// Interpret the pixel diff between two RGBA buffers.
///
/// Returns the `InterpretResult` as a plain JS object — the same shape
/// `@blazediff/interpret-native` returns, because both serialize the one
/// `Serialize` derive on the struct.
///
/// If `out_diff` is provided, the diff visualization is written into it
/// in-place (must be width*height*4 bytes). Pass `null`/`undefined` to skip it;
/// the diff still needs a scratch buffer internally, but nothing is copied back.
#[wasm_bindgen(js_name = interpretRgba)]
pub fn interpret_rgba(
    rgba_a: Vec<u8>,
    rgba_b: Vec<u8>,
    width: u32,
    height: u32,
    threshold: f64,
    antialiasing: bool,
    out_diff: Option<js_sys::Uint8Array>,
) -> Result<JsValue, JsError> {
    let img1 = image_from_vec(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_vec(rgba_b, width, height, "rgba_b")?;

    let defaults = DiffOptions::default();
    let opts = DiffOptions {
        threshold,
        // Mirrors the N-API surface, which calls it `antialiasing` where the
        // core calls the inverse `include_aa`. Keeping the two front-ends
        // identical is what lets the same options object drive either.
        include_aa: !antialiasing,
        ..defaults
    };

    let mut output_image = out_diff.as_ref().map(|_| Image::new_uninit(width, height));

    let result = interpret_diff(&img1, &img2, output_image.as_mut(), &opts)
        .map_err(|e| JsError::new(&e.to_string()))?;

    // On identical input the diff intentionally leaves the output buffer
    // unwritten — see `Image::new_uninit`.
    copy_output(out_diff, output_image.as_ref(), result.diff_count > 0)?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}
