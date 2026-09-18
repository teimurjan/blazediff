//! Browser-facing wasm-bindgen entry points for `@blazediff/milo-wasm`.
//!
//! Buffers-only API: callers pre-decode images to RGBA8 bytes (via `<canvas>`,
//! `createImageBitmap`, `ImageDecoder`, etc.) and pass `Uint8Array`s in. No
//! codecs are bundled into the wasm artifact. wasm32 has no threads, so the
//! metric runs inline; the result is bit-identical to the native build's.

use crate::{milo, MiloOptions, Rgba8};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn _start() {
    console_error_panic_hook::set_once();
}

/// What `miloRgba` hands back. The maps are copied out on access, so a caller
/// that only wants the scores never pays for them.
#[wasm_bindgen]
pub struct MiloResult {
    raw_error: f64,
    mos: f64,
    mask: Vec<f32>,
    error_map: Vec<f32>,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl MiloResult {
    /// Masked mean absolute error. Zero means identical.
    #[wasm_bindgen(getter, js_name = rawError)]
    pub fn raw_error(&self) -> f64 {
        self.raw_error
    }

    /// The raw error on KADID-10k's 1-5 mean-opinion-score scale.
    #[wasm_bindgen(getter)]
    pub fn mos(&self) -> f64 {
        self.mos
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Row-major per-pixel visibility mask, `width * height` values.
    pub fn mask(&self) -> Vec<f32> {
        self.mask.clone()
    }

    /// Row-major per-pixel perceived error in 0..1, `width * height` values.
    #[wasm_bindgen(js_name = errorMap)]
    pub fn error_map(&self) -> Vec<f32> {
        self.error_map.clone()
    }
}

/// Check that `rgba` holds exactly `width * height` RGBA pixels.
///
/// Taken by value for the same reason as in `blazediff`'s `wasm.rs`:
/// wasm-bindgen has already copied the JS typed array into a wasm-side
/// allocation, and an owned `Vec<u8>` takes ownership of exactly that
/// allocation rather than copying it again.
fn checked(rgba: Vec<u8>, width: u32, height: u32, label: &str) -> Result<Vec<u8>, JsError> {
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
    Ok(rgba)
}

/// Score `distorted` against `reference`, both RGBA8 buffers of
/// `width * height * 4` bytes.
#[wasm_bindgen(js_name = miloRgba)]
pub fn milo_rgba(
    reference: Vec<u8>,
    distorted: Vec<u8>,
    width: u32,
    height: u32,
) -> Result<MiloResult, JsError> {
    let reference = checked(reference, width, height, "reference")?;
    let distorted = checked(distorted, width, height, "distorted")?;
    let (w, h) = (width as usize, height as usize);
    let outcome = milo(
        Rgba8::new(&reference, w, h),
        Rgba8::new(&distorted, w, h),
        &MiloOptions::default(),
    )
    .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(MiloResult {
        raw_error: outcome.raw_error,
        mos: outcome.mos,
        mask: outcome.mask,
        error_map: outcome.error_map,
        width,
        height,
    })
}
