//! Browser-facing wasm-bindgen entry points.
//!
//! Buffers-only API: callers pre-decode images to RGBA8 bytes (via `<canvas>`,
//! `createImageBitmap`, `ImageDecoder`, etc.) and pass `Uint8Array`s in. No
//! PNG/JPEG decoders are bundled into the wasm artifact.

use crate::diff::diff;
use crate::types::{Background, DiffOptions, DiffResult, Image, Metric, RenderOptions};
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

fn copy_output(target: Option<js_sys::Uint8Array>, output: Option<&Image>) -> Result<(), JsError> {
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
    target.copy_from(&output.data);
    Ok(())
}

/// Diff two equally sized RGBA buffers.
///
/// Returns `[count, has_window, window_x, window_y, window_count]`. If
/// `out_diff` is provided, the visualization is written into it in place
/// (must be width*height*4 bytes).
#[wasm_bindgen(js_name = diffRgba)]
#[allow(clippy::too_many_arguments)]
pub fn diff_rgba(
    rgba_a: Vec<u8>,
    rgba_b: Vec<u8>,
    width: u32,
    height: u32,
    threshold: f64,
    antialiasing: bool,
    metric: Option<String>,
    mask: Option<Vec<u8>>,
    window: Option<u32>,
    alpha: f64,
    diff_color: Option<Vec<u8>>,
    diff_color_alt: Option<Vec<u8>>,
    aa_color: Option<Vec<u8>>,
    transparent: bool,
    out_diff: Option<js_sys::Uint8Array>,
) -> Result<Vec<u32>, JsError> {
    let img1 = image_from_vec(rgba_a, width, height, "rgba_a")?;
    let img2 = image_from_vec(rgba_b, width, height, "rgba_b")?;

    let defaults = RenderOptions::default();
    let opts = DiffOptions {
        threshold,
        antialiasing,
        metric: metric
            .as_deref()
            .map(str::parse::<Metric>)
            .transpose()
            .map_err(|e| JsError::new(&e))?
            .unwrap_or_default(),
        mask,
        window,
        render: RenderOptions {
            alpha,
            diff_color: optional_rgb(diff_color, "diff_color")?.unwrap_or(defaults.diff_color),
            diff_color_alt: optional_rgb(diff_color_alt, "diff_color_alt")?,
            aa_color: optional_rgb(aa_color, "aa_color")?.unwrap_or(defaults.aa_color),
            background: if transparent {
                Background::Transparent
            } else {
                Background::Faded
            },
        },
    };

    let mut output_image = out_diff.as_ref().map(|_| Image::new_uninit(width, height));

    let result = diff(&img1, &img2, output_image.as_mut(), &opts)
        .map_err(|e| JsError::new(&e.to_string()))?;

    copy_output(out_diff, output_image.as_ref())?;

    match result {
        DiffResult::Compared { count, window, .. } => Ok(match window {
            Some(hit) => vec![count, 1, hit.x, hit.y, hit.count],
            None => vec![count, 0, 0, 0, 0],
        }),
        DiffResult::DimensionMismatch { .. } => Err(JsError::new("unreachable: sizes are equal")),
    }
}
