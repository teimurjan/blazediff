//! spng decode: the default PNG decoder, the fallback behind the opt-in
//! `blazediff_png` codec, and that codec's differential-test oracle. Gated on
//! the `spng` feature alone so the oracle builds without `blazediff_png`.

use crate::spng_ffi::*;
use crate::{Image, ImageError};
use std::os::raw::c_int;

/// RAII guard for spng context cleanup
struct CtxGuard(*mut spng_ctx);
impl Drop for CtxGuard {
    fn drop(&mut self) {
        unsafe { spng_ctx_free(self.0) }
    }
}

/// Decode a PNG byte buffer through spng (FMT_RGBA8 + tRNS). The decode
/// fallback, and the reference oracle `blazediff_png` is verified against
/// byte-for-byte (see that crate's differential tests).
pub fn decode_spng(file_data: &[u8]) -> Result<Image, ImageError> {
    unsafe {
        // Adler32 verification is left on, but spng stops inflating at the
        // last scanline byte and never reads the trailer, so a wrong Adler32
        // does not error (pinned by blazediff-png's
        // `wrong_adler_trailer_is_never_read`).
        let ctx = spng_ctx_new(0);
        if ctx.is_null() {
            return Err(ImageError::Png("Failed to create spng context".into()));
        }
        let _guard = CtxGuard(ctx);

        // Skip CRC validation for speed
        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as c_int,
            spng_crc_action_SPNG_CRC_USE as c_int,
        );

        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);

        if spng_set_png_buffer(ctx, file_data.as_ptr() as *const _, file_data.len()) != 0 {
            return Err(ImageError::Png("Failed to set PNG buffer".into()));
        }

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        if spng_get_ihdr(ctx, &mut ihdr) != 0 {
            return Err(ImageError::Png("Failed to get IHDR".into()));
        }

        let width = ihdr.width;
        let height = ihdr.height;

        let mut out_size: usize = 0;
        if spng_decoded_image_size(ctx, spng_format_SPNG_FMT_RGBA8 as c_int, &mut out_size) != 0 {
            return Err(ImageError::Png("Failed to get decoded image size".into()));
        }

        // Allocate without zero-initialization (spng will overwrite)
        let mut data: Vec<u8> = Vec::with_capacity(out_size);
        data.set_len(out_size);

        if spng_decode_image(
            ctx,
            data.as_mut_ptr() as *mut _,
            out_size,
            spng_format_SPNG_FMT_RGBA8 as c_int,
            spng_decode_flags_SPNG_DECODE_TRNS as c_int,
        ) != 0
        {
            return Err(ImageError::Png("Failed to decode image".into()));
        }

        Ok(Image {
            data,
            width,
            height,
        })
    }
}

/// Differential-oracle hook: decode through spng at an arbitrary
/// `SPNG_FMT_*` + decode-flags combination, returning the raw output bytes
/// plus the image dimensions and source color type / bit depth. Used by
/// `blazediff_png`'s format-parity tests.
#[cfg(feature = "fuzzing")]
pub fn decode_spng_fmt(
    file_data: &[u8],
    fmt: c_int,
    flags: c_int,
) -> Result<(u32, u32, u8, u8, Vec<u8>), ImageError> {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_IGNORE_ADLER32 as c_int);
        if ctx.is_null() {
            return Err(ImageError::Png("Failed to create spng context".into()));
        }
        let _guard = CtxGuard(ctx);

        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as c_int,
            spng_crc_action_SPNG_CRC_USE as c_int,
        );
        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);

        if spng_set_png_buffer(ctx, file_data.as_ptr() as *const _, file_data.len()) != 0 {
            return Err(ImageError::Png("Failed to set PNG buffer".into()));
        }

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        if spng_get_ihdr(ctx, &mut ihdr) != 0 {
            return Err(ImageError::Png("Failed to get IHDR".into()));
        }

        let mut out_size: usize = 0;
        if spng_decoded_image_size(ctx, fmt, &mut out_size) != 0 {
            return Err(ImageError::Png("Failed to get decoded image size".into()));
        }

        // Zero-initialized: spng's interlaced sub-byte FMT_PNG/RAW path ORs
        // samples into shared bytes and assumes a cleared buffer.
        let mut data: Vec<u8> = vec![0u8; out_size];

        if spng_decode_image(ctx, data.as_mut_ptr() as *mut _, out_size, fmt, flags) != 0 {
            return Err(ImageError::Png("Failed to decode image".into()));
        }

        Ok((
            ihdr.width,
            ihdr.height,
            ihdr.color_type,
            ihdr.bit_depth,
            data,
        ))
    }
}
