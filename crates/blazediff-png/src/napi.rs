//! N-API bindings for `@blazediff/codec-png-native`: encoded PNG bytes in,
//! RGBA8 out, and back. File IO stays in the JS wrapper.

use crate::{binding, decode as decode_png, encode_ref, ImageRef};
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// A decoded image: RGBA8, 4 bytes per pixel, row-major.
#[napi(object)]
pub struct NapiImage {
    pub data: Buffer,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct NapiEncodeOptions {
    /// 0 writes stored (uncompressed) deflate; 1-12 are libdeflate levels.
    /// Default: 4.
    pub compression: Option<u8>,
    /// Row filter: "none", "sub", "up", "average", "paeth" or "adaptive".
    /// Default: "adaptive".
    pub filter: Option<String>,
    /// "auto" writes the smallest lossless color mode; "rgba8" skips that scan
    /// and writes the pixels as given. Default: "auto".
    pub color: Option<String>,
}

/// Decode a PNG to RGBA8.
#[napi]
pub fn decode(png: &[u8]) -> Result<NapiImage> {
    let image = decode_png(png)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Failed to decode PNG: {e}")))?;
    Ok(NapiImage {
        width: image.width,
        height: image.height,
        data: image.data.into(),
    })
}

/// Encode RGBA8 pixels (`width * height * 4` bytes) as a PNG.
#[napi]
pub fn encode(
    rgba: &[u8],
    width: u32,
    height: u32,
    options: Option<NapiEncodeOptions>,
) -> Result<Buffer> {
    let (compression, filter, color) = options
        .map(|o| (o.compression, o.filter, o.color))
        .unwrap_or_default();
    let options = binding::encode_options(compression, filter.as_deref(), color.as_deref())
        .map_err(|e| Error::new(Status::InvalidArg, e))?;
    let image = ImageRef {
        data: rgba,
        width,
        height,
    };
    encode_ref(image, &options)
        .map(Buffer::from)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Failed to encode PNG: {e}")))
}
