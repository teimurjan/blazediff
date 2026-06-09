//! Browser-facing wasm-bindgen entry points.
//!
//! Buffers-only API: callers pre-decode images to RGBA8 bytes (via `<canvas>`,
//! `createImageBitmap`, `ImageDecoder`, etc.) and pass `Uint8Array`s in. No
//! PNG/JPEG decoders are bundled into the wasm artifact.

use crate::diff::diff;
use crate::types::{DiffOptions, Image};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn _start() {
    console_error_panic_hook::set_once();
}

fn image_from_slice(rgba: &[u8], width: u32, height: u32, label: &str) -> Result<Image, JsError> {
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
        data: rgba.to_vec(),
        width,
        height,
    })
}

/// Diff two RGBA buffers. Returns the count of differing pixels.
///
/// If `out_diff` is provided, the visualization is written into it in-place
/// (must be width*height*4 bytes). Pass `null`/`undefined` to skip the
/// visualization and just get a count.
#[wasm_bindgen(js_name = diffRgba)]
pub fn diff_rgba(
    rgba_a: &[u8],
    rgba_b: &[u8],
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
    diff_mask: bool,
    out_diff: Option<js_sys::Uint8Array>,
) -> Result<u32, JsError> {
    let img1 = image_from_slice(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_slice(rgba_b, width, height, "rgba_b")?;

    let opts = DiffOptions {
        threshold,
        include_aa,
        diff_mask,
        ..Default::default()
    };

    let mut output_image = out_diff.as_ref().map(|_| Image::new_uninit(width, height));

    let result = diff(&img1, &img2, output_image.as_mut(), &opts)
        .map_err(|e| JsError::new(&e.to_string()))?;

    if let (Some(target), Some(out)) = (out_diff, output_image.as_ref()) {
        if (target.length() as usize) != out.data.len() {
            return Err(JsError::new(&format!(
                "out_diff: expected {} bytes, got {}",
                out.data.len(),
                target.length()
            )));
        }
        // On identical the diff intentionally leaves the output buffer
        // unwritten (the gray-fill is purely cosmetic and is skipped for
        // performance). Don't copy that uninitialized-feeling memory back
        // to the caller - preserve whatever they passed in.
        if !result.identical {
            target.copy_from(&out.data);
        }
    }

    Ok(result.diff_count)
}

/// Interpret the diff between two RGBA buffers into structured change regions.
///
/// Returns the `InterpretResult` (summary, regions with positions, change
/// types, severity, etc.) serialized as a plain JS object - the same shape the
/// native binding produces.
#[wasm_bindgen(js_name = interpretRgba)]
pub fn interpret_rgba(
    rgba_a: &[u8],
    rgba_b: &[u8],
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
) -> Result<JsValue, JsError> {
    let img1 = image_from_slice(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_slice(rgba_b, width, height, "rgba_b")?;

    let opts = DiffOptions {
        threshold,
        include_aa,
        ..Default::default()
    };

    let result = crate::interpret::interpret(&img1, &img2, &opts)
        .map_err(|e| JsError::new(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}
