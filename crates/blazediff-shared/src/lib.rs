//! The primitives every BlazeDiff crate sits on: the [`Image`] buffer, [`yiq`]
//! color math, and RGBA8 decode/encode for PNG, JPEG and QOI.
//!
//! It exists because the crates above it form a chain — `blazediff-interpret`
//! depends on both `blazediff` and `blazediff-ssim`, which know nothing about
//! each other — so anything two of them share has to live below all of them.
//! Every decoder normalizes to [`Image`], so the compute crates never see a
//! codec; PNG goes through vendored libspng, JPEG through vendored
//! libjpeg-turbo, QOI through `qoi-rust`.
//!
//! ```no_run
//! use blazediff_shared::{load_image_pair, save_image, ImageFormat};
//!
//! let (a, b) = load_image_pair("a.png", "b.jpg").unwrap();
//! assert_eq!(ImageFormat::from_path("a.png"), Some(ImageFormat::Png));
//! ```
//!
//! Without the default `codecs` feature the crate is pure Rust and compiles to
//! wasm32: [`Image`], [`ImageError`], [`ImageFormat`] and [`yiq`] remain, which
//! is all the wasm build of `blazediff` needs.

#[cfg(feature = "codecs")]
pub mod jpeg_io;
#[cfg(feature = "codecs")]
pub mod png_io;
#[cfg(feature = "codecs")]
pub mod qoi_io;
#[cfg(feature = "codecs")]
#[allow(
    non_upper_case_globals,
    non_camel_case_types,
    non_snake_case,
    dead_code
)]
pub mod spng_ffi;
#[cfg(feature = "codecs")]
#[allow(
    non_upper_case_globals,
    non_camel_case_types,
    non_snake_case,
    dead_code
)]
mod turbojpeg_ffi;
pub mod yiq;

#[cfg(feature = "codecs")]
use rayon::prelude::*;
use std::path::Path;

#[cfg(feature = "codecs")]
pub use jpeg_io::{decode_jpeg, load_jpeg, load_jpegs, save_jpeg};
#[cfg(feature = "codecs")]
pub use png_io::{
    decode_png, encode_png, load_png, load_pngs, save_png, save_png_with_compression,
};
#[cfg(feature = "codecs")]
pub use qoi_io::{decode_qoi, load_qoi, load_qois, save_qoi};

/// A decoded image: RGBA, 4 bytes per pixel, row-major.
pub struct Image {
    pub data: Vec<u8>, // RGBA, 4 bytes/pixel
    pub width: u32,
    pub height: u32,
}

impl Image {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            data: vec![0u8; (width * height * 4) as usize],
            width,
            height,
        }
    }

    /// Create an image whose pixel data is left uninitialized.
    ///
    /// Use this for diff-output buffers that the diff pipeline fully
    /// overwrites — either by `clear_transparent` (diff_mask mode), by the
    /// deferred gray-fill pass (when at least one block differs and diff_mask
    /// is off), or by the hot pass writing changed blocks. The only call path
    /// that does not overwrite is the early "identical" short-circuit: in that
    /// case `result.identical` is true and every shipping front-end (CLI,
    /// N-API, Python, the WASM in-place copy) already skips reading the output
    /// buffer.
    ///
    /// Avoiding `vec![0u8; ...]` here saves a 64 MB memset per 4K-image diff.
    /// The OS's allocator typically hands us freshly-cleared pages for big
    /// allocations anyway, but tiny diffs (a few hundred KB) reuse arena memory
    /// whose contents are whatever the last call left behind — fine here,
    /// because the callers above respect the "identical → don't read" contract.
    pub fn new_uninit(width: u32, height: u32) -> Self {
        let size = (width as usize) * (height as usize) * 4;
        let mut data: Vec<u8> = Vec::with_capacity(size);
        // SAFETY: the new length matches the capacity we just reserved, the
        // element type (`u8`) has no validity requirements, and every byte
        // of this allocation is overwritten before being read on every
        // non-identical diff path. Identical-input callers skip the read.
        unsafe {
            data.set_len(size);
        }
        Self {
            data,
            width,
            height,
        }
    }

    #[inline]
    pub fn as_u32(&self) -> &[u32] {
        bytemuck::cast_slice(&self.data)
    }

    #[inline]
    pub fn as_u32_mut(&mut self) -> &mut [u32] {
        bytemuck::cast_slice_mut(&mut self.data)
    }

    #[inline]
    pub fn get_pixel(&self, x: u32, y: u32) -> u32 {
        let idx = (y * self.width + x) as usize;
        self.as_u32()[idx]
    }

    #[inline]
    pub fn set_pixel(&mut self, x: u32, y: u32, pixel: u32) {
        let idx = (y * self.width + x) as usize;
        self.as_u32_mut()[idx] = pixel;
    }
}

/// Anything that can go wrong reading or writing an image.
///
/// The `Display` strings are part of the contract: the CLI, the N-API binding,
/// the Python extension and the JS wrappers all surface them verbatim, and
/// `@blazediff/core-native` pattern-matches on them to tell a missing file from
/// a malformed one.
#[derive(Debug)]
pub enum ImageError {
    Io(std::io::Error),
    Png(String),
    Jpeg(String),
    Qoi(String),
    UnsupportedFormat(String),
}

impl std::fmt::Display for ImageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImageError::Io(e) => write!(f, "IO error: {}", e),
            ImageError::Png(e) => write!(f, "PNG error: {}", e),
            ImageError::Jpeg(e) => write!(f, "JPEG error: {}", e),
            ImageError::Qoi(e) => write!(f, "QOI error: {}", e),
            ImageError::UnsupportedFormat(e) => write!(f, "Unsupported format: {}", e),
        }
    }
}

impl std::error::Error for ImageError {}

impl From<std::io::Error> for ImageError {
    fn from(e: std::io::Error) -> Self {
        ImageError::Io(e)
    }
}

/// The container formats BlazeDiff reads and writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Qoi,
}

impl ImageFormat {
    /// Detect from a file extension, case-insensitively.
    pub fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
            "qoi" => Some(ImageFormat::Qoi),
            _ => None,
        }
    }

    /// Detect from the leading magic bytes of an encoded buffer.
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Some(ImageFormat::Png);
        }
        if data.starts_with(&[0xff, 0xd8, 0xff]) {
            return Some(ImageFormat::Jpeg);
        }
        if data.starts_with(b"qoif") {
            return Some(ImageFormat::Qoi);
        }
        None
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ImageFormat::Png => "png",
            ImageFormat::Jpeg => "jpeg",
            ImageFormat::Qoi => "qoi",
        }
    }
}

/// Whether the in-house [`blazediff_png`] codec takes the PNG paths.
///
/// Opt in by setting `BLAZEDIFF_PNG_ENABLED` to a truthy value
/// (`1`/`true`/`yes`/`on`, any case); unset or anything else keeps PNG I/O
/// entirely on spng. Read once per process, so changing the variable after the
/// first PNG has been touched has no effect.
///
/// This is a property of the codec layer rather than of any one front-end, so
/// every caller of this crate inherits it: the `blazediff` CLI, its N-API and
/// Python bindings, and `@blazediff/ssim-native`.
///
/// Without the `codecs` feature there is no PNG path to route, so this is
/// always `false`.
#[cfg(feature = "codecs")]
pub fn blazediff_png_enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("BLAZEDIFF_PNG_ENABLED").is_ok_and(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
    })
}

#[cfg(not(feature = "codecs"))]
pub fn blazediff_png_enabled() -> bool {
    false
}

/// The payload is the path alone — `Display` supplies the "Unsupported format:"
/// prefix. All three front-ends used to pass a pre-prefixed string here and
/// print it doubled.
#[cfg(feature = "codecs")]
fn unsupported_path<P: AsRef<Path>>(path: P) -> ImageError {
    ImageError::UnsupportedFormat(path.as_ref().display().to_string())
}

/// Load one image, picking the decoder from the file extension.
#[cfg(feature = "codecs")]
pub fn load_image<P: AsRef<Path>>(path: P) -> Result<Image, ImageError> {
    match ImageFormat::from_path(&path).ok_or_else(|| unsupported_path(&path))? {
        ImageFormat::Png => load_png(path),
        ImageFormat::Jpeg => load_jpeg(path),
        ImageFormat::Qoi => load_qoi(path),
    }
}

/// Load two images in parallel, picking each decoder from its file extension.
///
/// When both share a format this delegates to that codec's paired loader, which
/// is a plain `rayon::join` — cheaper than the iterator machinery below for a
/// two-task workload.
#[cfg(feature = "codecs")]
pub fn load_image_pair<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), ImageError> {
    let fmt1 = ImageFormat::from_path(&path1).ok_or_else(|| unsupported_path(&path1))?;
    let fmt2 = ImageFormat::from_path(&path2).ok_or_else(|| unsupported_path(&path2))?;

    if fmt1 == fmt2 {
        return match fmt1 {
            ImageFormat::Png => load_pngs(&path1, &path2),
            ImageFormat::Jpeg => load_jpegs(&path1, &path2),
            ImageFormat::Qoi => load_qois(&path1, &path2),
        };
    }

    // Mixed formats: still load in parallel.
    let results: Vec<Result<Image, ImageError>> = [
        (path1.as_ref().to_path_buf(), fmt1),
        (path2.as_ref().to_path_buf(), fmt2),
    ]
    .par_iter()
    .map(|(path, fmt)| match fmt {
        ImageFormat::Png => load_png(path),
        ImageFormat::Jpeg => load_jpeg(path),
        ImageFormat::Qoi => load_qoi(path),
    })
    .collect();

    let mut iter = results.into_iter();
    Ok((iter.next().unwrap()?, iter.next().unwrap()?))
}

/// Decode an encoded buffer, picking the decoder from its magic bytes.
#[cfg(feature = "codecs")]
pub fn decode_image(data: &[u8]) -> Result<Image, ImageError> {
    match ImageFormat::from_bytes(data) {
        Some(ImageFormat::Png) => decode_png(data),
        Some(ImageFormat::Jpeg) => decode_jpeg(data),
        Some(ImageFormat::Qoi) => decode_qoi(data),
        None => Err(ImageError::UnsupportedFormat(
            "unrecognized image buffer, expected PNG, JPEG or QOI".to_string(),
        )),
    }
}

/// Decode two encoded buffers in parallel.
#[cfg(feature = "codecs")]
pub fn decode_image_pair(image1: &[u8], image2: &[u8]) -> Result<(Image, Image), ImageError> {
    let (result1, result2) = rayon::join(|| decode_image(image1), || decode_image(image2));
    Ok((result1?, result2?))
}

/// Write an image, picking the encoder from the file extension.
///
/// `compression` is the PNG level (0-9) and `quality` the JPEG quality (1-100);
/// each is ignored by the formats it does not apply to.
#[cfg(feature = "codecs")]
pub fn save_image<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
    quality: u8,
) -> Result<(), ImageError> {
    match ImageFormat::from_path(&path).ok_or_else(|| unsupported_path(&path))? {
        ImageFormat::Png => save_png_with_compression(image, path, compression),
        ImageFormat::Jpeg => save_jpeg(image, path, quality),
        ImageFormat::Qoi => save_qoi(image, path),
    }
}

/// Fuzzing-only oracle: exposes the spng reference decoder so the
/// `blazediff_png` differential tests can check their decode against it.
#[cfg(feature = "fuzzing")]
#[doc(hidden)]
pub fn decode_spng_reference(data: &[u8]) -> Result<Image, ImageError> {
    png_io::decode_spng(data)
}

/// Fuzzing-only oracle: decode through spng at an arbitrary `SPNG_FMT_*` and
/// decode-flags combination, for `blazediff_png`'s format-parity tests.
/// Returns `(width, height, color_type, bit_depth, bytes)`.
#[cfg(feature = "fuzzing")]
#[doc(hidden)]
pub fn decode_spng_reference_fmt(
    data: &[u8],
    fmt: std::os::raw::c_int,
    flags: std::os::raw::c_int,
) -> Result<(u32, u32, u8, u8, Vec<u8>), ImageError> {
    png_io::decode_spng_fmt(data, fmt, flags)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_format_from_extension() {
        assert_eq!(ImageFormat::from_path("a.PNG"), Some(ImageFormat::Png));
        assert_eq!(ImageFormat::from_path("a.jpg"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_path("a.jpeg"), Some(ImageFormat::Jpeg));
        assert_eq!(ImageFormat::from_path("a.qoi"), Some(ImageFormat::Qoi));
        assert_eq!(ImageFormat::from_path("a.webp"), None);
        assert_eq!(ImageFormat::from_path("noext"), None);
    }

    #[test]
    fn detects_format_from_magic_bytes() {
        assert_eq!(
            ImageFormat::from_bytes(b"\x89PNG\r\n\x1a\n\x00"),
            Some(ImageFormat::Png)
        );
        assert_eq!(
            ImageFormat::from_bytes(&[0xff, 0xd8, 0xff, 0xe0]),
            Some(ImageFormat::Jpeg)
        );
        assert_eq!(ImageFormat::from_bytes(b"qoifXXXX"), Some(ImageFormat::Qoi));
        assert_eq!(ImageFormat::from_bytes(b"RIFF"), None);
        assert_eq!(ImageFormat::from_bytes(b""), None);
    }

    #[test]
    fn error_display_strings_are_stable() {
        assert_eq!(
            ImageError::Png("boom".into()).to_string(),
            "PNG error: boom"
        );
        assert_eq!(
            ImageError::Jpeg("boom".into()).to_string(),
            "JPEG error: boom"
        );
        assert_eq!(
            ImageError::Qoi("boom".into()).to_string(),
            "QOI error: boom"
        );
        assert_eq!(
            ImageError::UnsupportedFormat("a.webp".into()).to_string(),
            "Unsupported format: a.webp"
        );
    }
}
