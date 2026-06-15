//! Full-spec PNG codec with byte-exact decode parity to libspng's
//! `SPNG_FMT_RGBA8` path (the blazediff reference decoder configuration:
//! tRNS applied, adler32 ignored, CRCs unverified) and round-trip-verified
//! encoding.
//!
//! - **Decode**: every format spng accepts — bit depths 1/2/4/8/16, all five
//!   color types, palette + tRNS, gray/RGB tRNS color-keying, Adam7
//!   interlacing — decoded to RGBA8 byte-identically to spng, with the same
//!   accept/reject behavior on malformed inputs.
//! - **Decode formats**: [`decode_with`] targets any spng `SPNG_FMT_*`
//!   (`RGBA8`/`RGBA16`/`RGB8`/`GA8`/`GA16`/`G8`/native `PNG`/`RAW`) with
//!   optional tRNS / gamma / sBIT transforms, each byte-identical to
//!   `spng_decode_image` — see [`DecodeFormat`] / [`DecodeOptions`].
//! - **Encode**: all PNG color type / bit depth combinations, optional
//!   Adam7, real deflate levels (libdeflate) plus a stored-block level 0;
//!   verified by `decode(encode(x)) == x` and spng cross-decode.
//! - **Fast**: single-threaded and SIMD-first — whole-buffer libdeflate
//!   inflate, in-place sequential defiltering, autovectorizable row
//!   expansion, and NEON-accelerated encode-filter kernels.
//! - **Metadata**: [`decode_with_metadata`] / [`encode_with_metadata`] capture
//!   and emit every ancillary chunk spng exposes (text, color management,
//!   timing, physical dimensions, EXIF, suggested palettes, explicit
//!   palette/transparency) plus unknown-chunk passthrough — verified field by
//!   field against `spng_get_*`. The plain [`decode`] stays metadata-free for
//!   the pixel hot path.
//!
//! ```no_run
//! let bytes = std::fs::read("image.png").unwrap();
//! let image = blazediff_png::decode(&bytes).unwrap();
//! let png = blazediff_png::encode(&image, &blazediff_png::EncodeOptions::default()).unwrap();
//! ```

#[cfg(not(any(feature = "zlib-backend", feature = "rust-backend")))]
compile_error!(
    "blazediff_png needs a deflate backend: enable `zlib-backend` (default, \
     spng parity) or `rust-backend` (pure-Rust, C-free)."
);

mod backend;
mod chunks;
mod container;
mod convert;
mod decode;
mod defilter;
mod encode;
mod error;
mod expand;
mod format;
mod interlace;
mod meta;

pub use encode::{ColorMode, EncodeOptions, Filter, FilterSet};
pub use error::PngError;
pub use format::{DecodeFormat, DecodeOptions, Decoded};
pub use meta::{
    Bkgd, Chrm, Iccp, Location, Metadata, Offs, Palette, Phys, Sbit, Splt, SpltEntry, Text,
    TextKind, Time, Trns, UnknownChunk,
};

/// Decoded image: RGBA8, 4 bytes per pixel, row-major.
pub struct Image {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Borrowed RGBA8 view, the input for the streaming encode entry points
/// ([`encode_ref`] / [`encode_to`]). Lets a caller encode straight from an
/// existing buffer without handing ownership to an [`Image`].
#[derive(Clone, Copy)]
pub struct ImageRef<'a> {
    pub data: &'a [u8],
    pub width: u32,
    pub height: u32,
}

impl<'a> From<&'a Image> for ImageRef<'a> {
    fn from(image: &'a Image) -> Self {
        ImageRef {
            data: &image.data,
            width: image.width,
            height: image.height,
        }
    }
}

/// True 16-bit image: RGBA16 host-order, 4 `u16` channels per pixel,
/// row-major. The input type for [`encode16`], and the natural pairing with
/// [`decode_with`] at [`DecodeFormat::Rgba16`].
pub struct Image16 {
    pub data: Vec<u16>,
    pub width: u32,
    pub height: u32,
}

/// An image plus all of its non-pixel chunk data, from
/// [`decode_with_metadata`].
pub struct DecodedPng {
    pub image: Image,
    pub meta: Metadata,
}

/// Decode a PNG to RGBA8, byte-identical to libspng's FMT_RGBA8 + tRNS
/// output for every input spng accepts, rejecting the inputs spng rejects.
pub fn decode(data: &[u8]) -> Result<Image, PngError> {
    decode::decode(data)
}

/// Fuzzing-only: strict-window reference decode used by the differential
/// harness to classify streams with no deterministic behavioral contract
/// (classic zlib reads uninitialized window memory for them).
#[cfg(feature = "fuzzing")]
#[doc(hidden)]
pub fn decode_strict_window(data: &[u8]) -> Result<Image, PngError> {
    decode::decode_strict_window(data)
}

/// Decode a PNG to an arbitrary [`DecodeFormat`] with optional tRNS / gamma /
/// sBIT transforms, byte-identical to libspng's `spng_decode_image(fmt,
/// flags)`. [`decode`] is the `Rgba8` + tRNS special case.
///
/// ```no_run
/// use blazediff_png::{decode_with, DecodeFormat, DecodeOptions};
/// let bytes = std::fs::read("image.png").unwrap();
/// let out = decode_with(&bytes, &DecodeOptions { format: DecodeFormat::Rgb8, ..Default::default() }).unwrap();
/// ```
pub fn decode_with(data: &[u8], options: &DecodeOptions) -> Result<Decoded, PngError> {
    decode::decode_with(data, options)
}

/// Encode an RGBA8 image to PNG. The requested color mode must represent
/// the image losslessly (`decode(encode(x)) == x` always holds);
/// [`EncodeOptions::default`] auto-picks the smallest lossless mode.
pub fn encode(image: &Image, options: &EncodeOptions) -> Result<Vec<u8>, PngError> {
    encode::encode(image.into(), options, &Metadata::default())
}

/// [`encode`] from a borrowed [`ImageRef`] — same output, no [`Image`]
/// ownership required. The hot path (`Rgba8` + `Filter::None` + level 0,
/// non-interlaced, no metadata) is written straight from the borrowed rows
/// with no intermediate raw or zlib buffer.
pub fn encode_ref(image: ImageRef, options: &EncodeOptions) -> Result<Vec<u8>, PngError> {
    encode::encode(image, options, &Metadata::default())
}

/// Stream a PNG encode straight into `out` instead of returning a `Vec`. For
/// the stored RGBA8 hot path this keeps peak memory at roughly the input size:
/// the deflate stored blocks are written directly to the sink with no full-size
/// intermediate buffer. Other modes build a `Vec` and write it through. Wrap a
/// `File` in a `BufWriter` — the stored path issues many small writes.
pub fn encode_to<W: std::io::Write>(
    image: ImageRef,
    options: &EncodeOptions,
    out: &mut W,
) -> Result<(), PngError> {
    encode::encode_to(image, options, &Metadata::default(), out)
}

/// Encode a true 16-bit [`Image16`] to PNG, carrying full 16-bit precision
/// (unlike [`encode`], which byte-replicates an 8-bit source). The color mode
/// must be a 16-bit one — `Gray16`/`GrayAlpha16`/`Rgb16`/`Rgba16` or `Auto`;
/// [`EncodeOptions::default`] auto-picks the smallest lossless 16-bit mode.
pub fn encode16(image: &Image16, options: &EncodeOptions) -> Result<Vec<u8>, PngError> {
    encode::encode16(image, options, &Metadata::default())
}

/// [`encode16`] with caller-supplied ancillary chunks, mirroring
/// [`encode_with_metadata`].
pub fn encode16_with_metadata(
    image: &Image16,
    options: &EncodeOptions,
    meta: &Metadata,
) -> Result<Vec<u8>, PngError> {
    encode::encode16(image, options, meta)
}

/// Decode a PNG to RGBA8 *and* capture every ancillary chunk spng exposes
/// (text, color management, timing, physical dimensions, EXIF, suggested
/// palettes, and unknown chunks), with the same accept/reject behavior as
/// [`decode`]. Heavier than [`decode`] — use that when only pixels are
/// needed.
pub fn decode_with_metadata(data: &[u8]) -> Result<DecodedPng, PngError> {
    decode::decode_with_metadata(data)
}

/// Encode an RGBA8 image to PNG, emitting the supplied metadata chunks in
/// spec-valid positions. When `meta.palette` is set and the resolved color
/// mode is indexed, that palette (and `meta.transparency`) is used verbatim
/// instead of the auto-derived one.
pub fn encode_with_metadata(
    image: &Image,
    options: &EncodeOptions,
    meta: &Metadata,
) -> Result<Vec<u8>, PngError> {
    encode::encode(image.into(), options, meta)
}
