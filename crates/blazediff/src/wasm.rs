//! Browser-facing wasm-bindgen entry points.
//!
//! Buffers-only API: callers pre-decode images to RGBA8 bytes (via `<canvas>`,
//! `createImageBitmap`, `ImageDecoder`, etc.) and pass `Uint8Array`s in. No
//! PNG/JPEG decoders are bundled into the wasm artifact.

use crate::diff::diff;
use crate::types::{DiffOptions, Image};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn _start() {
    console_error_panic_hook::set_once();
}

/// Wrap the caller's RGBA bytes without copying them.
///
/// The parameter is taken by value: wasm-bindgen has already copied the JS
/// typed array into a wasm-side allocation, and an owned `Vec<u8>` parameter
/// takes ownership of exactly that allocation. Borrowing it as `&[u8]` and
/// calling `to_vec()` would copy every input buffer a second time: 143 MB per
/// call for a 4K pair, before comparing a single pixel.
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

fn optional_rgb(value: Option<Vec<u8>>, label: &str) -> Result<Option<[u8; 3]>, JsError> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value.as_slice() {
        [r, g, b] => Ok(Some([*r, *g, *b])),
        _ => Err(JsError::new(&format!(
            "{}: expected 3 channels, got {}",
            label,
            value.len()
        ))),
    }
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

/// Diff two RGBA buffers. Returns the count of differing pixels.
///
/// If `out_diff` is provided, the visualization is written into it in-place
/// (must be width*height*4 bytes). Pass `null`/`undefined` to skip the
/// visualization and just get a count.
#[wasm_bindgen(js_name = diffRgba)]
pub fn diff_rgba(
    rgba_a: Vec<u8>,
    rgba_b: Vec<u8>,
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
    diff_mask: bool,
    diff_color_alt: Option<Vec<u8>>,
    out_diff: Option<js_sys::Uint8Array>,
) -> Result<u32, JsError> {
    let img1 = image_from_vec(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_vec(rgba_b, width, height, "rgba_b")?;

    let opts = DiffOptions {
        threshold,
        include_aa,
        diff_mask,
        diff_color_alt: optional_rgb(diff_color_alt, "diff_color_alt")?,
        ..Default::default()
    };

    let mut output_image = out_diff.as_ref().map(|_| Image::new_uninit(width, height));

    let result = diff(&img1, &img2, output_image.as_mut(), &opts)
        .map_err(|e| JsError::new(&e.to_string()))?;

    // On identical the diff intentionally leaves the output buffer unwritten.
    copy_output(out_diff, output_image.as_ref(), !result.identical)?;

    Ok(result.diff_count)
}

/// Interpret the diff between two RGBA buffers into structured change regions.
///
/// Returns the `InterpretResult` (summary, regions with positions, change
/// types, severity, etc.) serialized as a plain JS object - the same shape the
/// native binding produces.
#[wasm_bindgen(js_name = interpretRgba)]
pub fn interpret_rgba(
    rgba_a: Vec<u8>,
    rgba_b: Vec<u8>,
    width: u32,
    height: u32,
    threshold: f64,
    include_aa: bool,
    diff_mask: bool,
    diff_color_alt: Option<Vec<u8>>,
    out_diff: Option<js_sys::Uint8Array>,
) -> Result<JsValue, JsError> {
    let img1 = image_from_vec(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_vec(rgba_b, width, height, "rgba_b")?;

    let opts = DiffOptions {
        threshold,
        include_aa,
        diff_mask,
        diff_color_alt: optional_rgb(diff_color_alt, "diff_color_alt")?,
        ..Default::default()
    };

    let mut output_image = out_diff.as_ref().map(|_| Image::new_uninit(width, height));
    let result =
        crate::interpret::interpret_with_output(&img1, &img2, output_image.as_mut(), &opts)
            .map_err(|e| JsError::new(&e.to_string()))?;
    copy_output(out_diff, output_image.as_ref(), result.diff_count > 0)?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Interpret a set of caller-supplied change regions.
///
/// The regions-in counterpart to [`interpret_rgba`]: instead of running a pixel
/// diff to find what changed, the caller says where. That lets JS drive the
/// classifier from anything it already knows — DOM rectangles, a crop list, or
/// regions derived from a similarity map — and still get per-pixel statistics,
/// because each box is refined against the source pixels before it is measured.
///
/// `regions` is an array of `{ x, y, width, height }` in image coordinates. A
/// region outside the image is rejected rather than read out of bounds.
#[wasm_bindgen(js_name = interpretRegionsRgba)]
pub fn interpret_regions_rgba(
    rgba_a: Vec<u8>,
    rgba_b: Vec<u8>,
    width: u32,
    height: u32,
    regions: JsValue,
) -> Result<JsValue, JsError> {
    let img1 = image_from_vec(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_vec(rgba_b, width, height, "rgba_b")?;

    let regions: Vec<blazediff_interpret::BoundingBox> = serde_wasm_bindgen::from_value(regions)
        .map_err(|e| JsError::new(&format!("Invalid regions: {e}")))?;

    let result = blazediff_interpret::interpret_regions(&img1, &img2, &regions)
        .map_err(|e| JsError::new(&e.to_string()))?;

    serde_wasm_bindgen::to_value(&result).map_err(|e| JsError::new(&e.to_string()))
}
