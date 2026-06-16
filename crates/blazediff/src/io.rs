//! PNG I/O: spng handles all decode and encode by default. The experimental
//! in-house [`blazediff_png`] codec is opt-in via the `BLAZEDIFF_PNG_ENABLED` env var —
//! when enabled it takes the decode and stored-block (level 0) encode paths,
//! with spng staying as the defensive decode fallback.

use crate::spng_ffi::*;
use crate::types::{DiffError, Image};
use memmap2::Mmap;
use std::fs::File;
use std::io::Write;
use std::os::raw::c_int;
use std::path::Path;
use std::sync::OnceLock;

/// Whether the experimental [`blazediff_png`] codec is enabled. Opt-in via
/// `BLAZEDIFF_PNG_ENABLED` set to a truthy value (`1`/`true`/`yes`/`on`, any case);
/// unset or anything else keeps PNG I/O entirely on spng. Read once per
/// process.
fn blazediff_png_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("BLAZEDIFF_PNG_ENABLED").is_ok_and(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
    })
}

/// RAII guard for spng context cleanup
struct CtxGuard(*mut spng_ctx);
impl Drop for CtxGuard {
    fn drop(&mut self) {
        unsafe { spng_ctx_free(self.0) }
    }
}

pub fn load_png<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    let file = File::open(path.as_ref())?;
    let file_data = unsafe { Mmap::map(&file)? };

    // When enabled, blazediff_png decodes every format spng accepts,
    // byte-identically, and is substantially faster (whole-buffer libdeflate
    // inflate, SIMD defilter); spng stays as a defensive fallback should the
    // codec ever reject an input spng would have taken. Off by default while
    // the codec is experimental.
    if blazediff_png_enabled() {
        if let Ok(img) = blazediff_png::decode(&file_data) {
            return Ok(Image {
                data: img.data,
                width: img.width,
                height: img.height,
            });
        }
    }
    decode_spng(&file_data)
}

/// Decode a PNG byte buffer through spng (FMT_RGBA8 + tRNS). The decode
/// fallback, and the reference oracle `blazediff_png` is verified against
/// byte-for-byte (see that crate's differential tests).
pub(crate) fn decode_spng(file_data: &[u8]) -> Result<Image, DiffError> {
    unsafe {
        // Keep Adler32 verification on: `load_png` is public API decoding
        // arbitrary, possibly untrusted PNGs (CLI + napi/python bindings), so a
        // corrupt zlib stream must error rather than yield wrong pixels.
        let ctx = spng_ctx_new(0);
        if ctx.is_null() {
            return Err(DiffError::PngError("Failed to create spng context".into()));
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
            return Err(DiffError::PngError("Failed to set PNG buffer".into()));
        }

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        if spng_get_ihdr(ctx, &mut ihdr) != 0 {
            return Err(DiffError::PngError("Failed to get IHDR".into()));
        }

        let width = ihdr.width;
        let height = ihdr.height;

        let mut out_size: usize = 0;
        if spng_decoded_image_size(ctx, spng_format_SPNG_FMT_RGBA8 as c_int, &mut out_size) != 0 {
            return Err(DiffError::PngError(
                "Failed to get decoded image size".into(),
            ));
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
            return Err(DiffError::PngError("Failed to decode image".into()));
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
pub(crate) fn decode_spng_fmt(
    file_data: &[u8],
    fmt: c_int,
    flags: c_int,
) -> Result<(u32, u32, u8, u8, Vec<u8>), DiffError> {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_IGNORE_ADLER32 as c_int);
        if ctx.is_null() {
            return Err(DiffError::PngError("Failed to create spng context".into()));
        }
        let _guard = CtxGuard(ctx);

        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as c_int,
            spng_crc_action_SPNG_CRC_USE as c_int,
        );
        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);

        if spng_set_png_buffer(ctx, file_data.as_ptr() as *const _, file_data.len()) != 0 {
            return Err(DiffError::PngError("Failed to set PNG buffer".into()));
        }

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        if spng_get_ihdr(ctx, &mut ihdr) != 0 {
            return Err(DiffError::PngError("Failed to get IHDR".into()));
        }

        let mut out_size: usize = 0;
        if spng_decoded_image_size(ctx, fmt, &mut out_size) != 0 {
            return Err(DiffError::PngError(
                "Failed to get decoded image size".into(),
            ));
        }

        // Zero-initialized: spng's interlaced sub-byte FMT_PNG/RAW path ORs
        // samples into shared bytes and assumes a cleared buffer.
        let mut data: Vec<u8> = vec![0u8; out_size];

        if spng_decode_image(ctx, data.as_mut_ptr() as *mut _, out_size, fmt, flags) != 0 {
            return Err(DiffError::PngError("Failed to decode image".into()));
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

pub fn load_pngs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    // `rayon::join` is a direct fork/join over two closures and runs the
    // first on the calling thread while a worker steals the second. It
    // avoids the iterator/Vec/collect machinery of `par_iter`, which adds
    // noticeable overhead (hundreds of µs) for two-task workloads — a
    // significant fraction of total time on small-image benchmarks.
    let (r1, r2) = rayon::join(|| load_png(path1.as_ref()), || load_png(path2.as_ref()));
    Ok((r1?, r2?))
}

pub fn save_png<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), DiffError> {
    save_png_with_compression(image, path, 0)
}

pub fn save_png_with_compression<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
) -> Result<(), DiffError> {
    let png_data = encode_png(image, compression as i32)?;
    let mut file = File::create(path.as_ref())?;
    file.write_all(&png_data)?;
    Ok(())
}

pub fn encode_png(image: &Image, compression_level: i32) -> Result<Vec<u8>, DiffError> {
    // Level 0 means stored (uncompressed) deflate blocks; when the
    // experimental codec is enabled, blazediff_png writes them directly
    // instead of going through zlib. RGBA8 + filter none matches the
    // truecolor-alpha output the rest of the pipeline produces. Off by
    // default — spng's level-0 path below produces the same stored output.
    if compression_level == 0 && blazediff_png_enabled() {
        // Borrow the RGBA8 buffer instead of cloning it into an owned Image.
        let png = blazediff_png::ImageRef {
            data: &image.data,
            width: image.width,
            height: image.height,
        };
        let options = blazediff_png::EncodeOptions {
            color: blazediff_png::ColorMode::Rgba8,
            compression: 0,
            filter: blazediff_png::Filter::None,
            interlace: false,
        };
        return blazediff_png::encode_ref(png, &options)
            .map_err(|e| DiffError::PngError(format!("blazediff_png encode failed: {e}")));
    }
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        if ctx.is_null() {
            return Err(DiffError::PngError(
                "Failed to create spng encoder context".into(),
            ));
        }

        let mut ihdr = spng_ihdr {
            width: image.width,
            height: image.height,
            bit_depth: 8,
            color_type: spng_color_type_SPNG_COLOR_TYPE_TRUECOLOR_ALPHA as u8,
            compression_method: 0,
            filter_method: spng_filter_SPNG_FILTER_NONE as u8,
            interlace_method: spng_interlace_method_SPNG_INTERLACE_NONE as u8,
        };

        if spng_set_ihdr(ctx, &mut ihdr) != 0 {
            spng_ctx_free(ctx);
            return Err(DiffError::PngError("Failed to set IHDR".into()));
        }

        spng_set_option(ctx, spng_option_SPNG_ENCODE_TO_BUFFER, 1);
        spng_set_option(
            ctx,
            spng_option_SPNG_FILTER_CHOICE,
            spng_filter_choice_SPNG_DISABLE_FILTERING as c_int,
        );
        spng_set_option(
            ctx,
            spng_option_SPNG_IMG_COMPRESSION_LEVEL,
            compression_level,
        );

        let flags = spng_encode_flags_SPNG_ENCODE_FINALIZE as c_int;
        let ret = spng_encode_image(
            ctx,
            image.data.as_ptr() as *const _,
            image.data.len(),
            spng_format_SPNG_FMT_PNG as c_int,
            flags,
        );

        if ret != 0 {
            spng_ctx_free(ctx);
            return Err(DiffError::PngError(format!(
                "Failed to encode image: {}",
                ret
            )));
        }

        let mut len: usize = 0;
        let mut error: c_int = 0;
        let buf = spng_get_png_buffer(ctx, &mut len, &mut error);

        if buf.is_null() || error != 0 {
            spng_ctx_free(ctx);
            return Err(DiffError::PngError(format!(
                "Failed to get PNG buffer: {}",
                error
            )));
        }

        let result = std::slice::from_raw_parts(buf as *const u8, len).to_vec();

        libc::free(buf);
        spng_ctx_free(ctx);

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_creation() {
        let img = Image::new(100, 100);
        assert_eq!(img.width, 100);
        assert_eq!(img.height, 100);
        assert_eq!(img.data.len(), 100 * 100 * 4);
    }
}
