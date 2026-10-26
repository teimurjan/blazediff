//! wasm-bindgen entry points for `@blazediff/codec-png-wasm`. Built on the
//! pure-Rust backend: zune-inflate decodes and fdeflate compresses, so every
//! level above 0 runs fdeflate's single fast mode.

use crate::{binding, decode as decode_png, encode_ref, ImageRef};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn _start() {
    console_error_panic_hook::set_once();
}

/// What `decode` returns. Read `width` and `height`, then call `takeData()`,
/// which moves the pixels out and frees the struct.
#[wasm_bindgen]
pub struct DecodedImage {
    data: Vec<u8>,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl DecodedImage {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// RGBA8 pixels, row-major. Consumes the struct, so the pixels cross into
    /// JS with one copy instead of two.
    #[wasm_bindgen(js_name = takeData)]
    pub fn take_data(self) -> Vec<u8> {
        self.data
    }
}

/// Decode a PNG to RGBA8.
#[wasm_bindgen]
pub fn decode(png: &[u8]) -> Result<DecodedImage, JsError> {
    let image = decode_png(png).map_err(|e| JsError::new(&format!("Failed to decode PNG: {e}")))?;
    Ok(DecodedImage {
        data: image.data,
        width: image.width,
        height: image.height,
    })
}

/// Encode RGBA8 pixels (`width * height * 4` bytes) as a PNG. `compression`
/// is 0 (stored) or 1-12 (default 4); `filter` is "none", "sub", "up",
/// "average", "paeth" or "adaptive" (default); `color` is "auto" (default,
/// smallest lossless mode) or "rgba8".
#[wasm_bindgen]
pub fn encode(
    rgba: &[u8],
    width: u32,
    height: u32,
    compression: Option<u8>,
    filter: Option<String>,
    color: Option<String>,
) -> Result<Vec<u8>, JsError> {
    let options = binding::encode_options(compression, filter.as_deref(), color.as_deref())
        .map_err(|e| JsError::new(&e))?;
    let image = ImageRef {
        data: rgba,
        width,
        height,
    };
    encode_ref(image, &options).map_err(|e| JsError::new(&format!("Failed to encode PNG: {e}")))
}
