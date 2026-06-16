//! Output-format selection and decode options, mirroring libspng's
//! `SPNG_FMT_*` formats and `SPNG_DECODE_*` flags.
//!
//! The decode pipeline is byte-exact to spng for every format: see
//! `check_decode_fmt` / `calculate_image_width` in spng's `spng.c` for the
//! gating and sizing contract this module replicates, and [`crate::convert`]
//! for the per-pixel conversion contract.

use crate::chunks::{Ihdr, COLOR_GRAYSCALE};
use crate::error::PngError;

/// Output pixel layout for [`crate::decode_with`], one variant per spng
/// `SPNG_FMT_*`. `Rgba8` is the historical default ([`crate::decode`]).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DecodeFormat {
    /// 8-bit RGBA, 4 bytes/pixel (spng `SPNG_FMT_RGBA8`).
    Rgba8,
    /// 16-bit RGBA, 8 bytes/pixel, host-endian (spng `SPNG_FMT_RGBA16`).
    Rgba16,
    /// 8-bit RGB, 3 bytes/pixel (spng `SPNG_FMT_RGB8`); transparency N/A.
    Rgb8,
    /// 8-bit gray+alpha, 2 bytes/pixel (spng `SPNG_FMT_GA8`). Grayscale
    /// source, bit depth <= 8 only.
    Ga8,
    /// 16-bit gray+alpha, 4 bytes/pixel, host-endian (spng `SPNG_FMT_GA16`).
    /// Grayscale source, bit depth 16 only.
    Ga16,
    /// 8-bit gray, 1 byte/pixel (spng `SPNG_FMT_G8`). Grayscale source, bit
    /// depth <= 8 only.
    G8,
    /// Native color type + bit depth, host-endian 16-bit, sub-byte packed
    /// (spng `SPNG_FMT_PNG`). No scaling, gamma, or transparency.
    Png,
    /// Native, big-endian 16-bit, sub-byte packed, no byteswap (spng
    /// `SPNG_FMT_RAW`). No scaling, gamma, or transparency.
    Raw,
}

/// Decode configuration: the output format plus the optional sample
/// transforms, mirroring spng's `SPNG_DECODE_TRNS / _GAMMA / _USE_SBIT`.
#[derive(Clone, Copy, Debug)]
pub struct DecodeOptions {
    /// Target pixel layout.
    pub format: DecodeFormat,
    /// Apply tRNS transparency (spng `SPNG_DECODE_TRNS`). Ignored for source
    /// color types that already carry alpha and for `Rgb8`/`Png`/`Raw`.
    pub apply_trns: bool,
    /// Apply gAMA gamma correction (spng `SPNG_DECODE_GAMMA`). Only affects
    /// `Rgba8`/`Rgba16`/`Rgb8`; requires a stored gAMA chunk.
    pub apply_gamma: bool,
    /// Rescale samples by their sBIT significant bits (spng
    /// `SPNG_DECODE_USE_SBIT`); requires a stored sBIT chunk.
    pub apply_sbit: bool,
}

impl Default for DecodeOptions {
    fn default() -> Self {
        Self {
            format: DecodeFormat::Rgba8,
            apply_trns: true,
            apply_gamma: false,
            apply_sbit: false,
        }
    }
}

/// Decoded pixels plus the layout needed to interpret `data`. Returned by
/// [`crate::decode_with`].
pub struct Decoded {
    /// Output bytes, row-major. For 16-bit `Rgba16`/`Ga16`/`Png` samples are
    /// host-endian; for `Raw` they stay big-endian. `Png`/`Raw` keep sub-byte
    /// depths packed.
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// The format `data` is in (echoes the requested format).
    pub format: DecodeFormat,
    /// Source PNG color type (relevant for `Png`/`Raw`).
    pub color_type: u8,
    /// Source PNG bit depth (relevant for `Png`/`Raw`).
    pub bit_depth: u8,
}

/// spng's `check_decode_fmt`: G8/GA8 need a grayscale source of depth <= 8,
/// GA16 a grayscale source of depth 16; all other formats accept any image.
pub(crate) fn check_decode_fmt(ihdr: &Ihdr, fmt: DecodeFormat) -> Result<(), PngError> {
    use DecodeFormat::*;
    match fmt {
        Rgba8 | Rgba16 | Rgb8 | Png | Raw => Ok(()),
        G8 | Ga8 => {
            if ihdr.color_type == COLOR_GRAYSCALE && ihdr.bit_depth <= 8 {
                Ok(())
            } else {
                Err(PngError::UnsupportedFormat)
            }
        }
        Ga16 => {
            if ihdr.color_type == COLOR_GRAYSCALE && ihdr.bit_depth == 16 {
                Ok(())
            } else {
                Err(PngError::UnsupportedFormat)
            }
        }
    }
}

/// Output bytes per full-image row (spng's `calculate_image_width`). For
/// `Png`/`Raw` this is the native packed scanline minus the filter byte.
pub(crate) fn image_row_bytes(ihdr: &Ihdr, fmt: DecodeFormat) -> Result<usize, PngError> {
    use DecodeFormat::*;
    let bpp: u64 = match fmt {
        Rgba8 | Ga16 => 4,
        Rgba16 => 8,
        Rgb8 => 3,
        G8 => 1,
        Ga8 => 2,
        Png | Raw => return Ok(ihdr.scanline_width(ihdr.width)? - 1),
    };
    let res = (ihdr.width as u64)
        .checked_mul(bpp)
        .ok_or(PngError::Overflow)?;
    usize::try_from(res).map_err(|_| PngError::Overflow)
}

/// Output bytes per pixel for the byte-aligned formats, used by the interlace
/// scatter. `None` for `Png`/`Raw` at sub-byte depth (those scatter by bit).
pub(crate) fn output_pixel_size(ihdr: &Ihdr, fmt: DecodeFormat) -> Option<usize> {
    use DecodeFormat::*;
    match fmt {
        Rgba8 => Some(4),
        Rgba16 => Some(8),
        Rgb8 => Some(3),
        Ga8 => Some(2),
        Ga16 => Some(4),
        G8 => Some(1),
        Png | Raw => {
            if ihdr.bit_depth < 8 {
                None
            } else {
                Some(ihdr.filter_bpp())
            }
        }
    }
}
