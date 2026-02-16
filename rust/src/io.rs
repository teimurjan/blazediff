//! PNG I/O via libspng with skip-CRC optimizations.

use crate::spng_ffi::*;
use crate::types::{DiffError, Image};
use memmap2::Mmap;
use rayon::prelude::*;
use std::fs::File;
use std::io::Write;
use std::os::raw::c_int;
use std::path::Path;

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

    unsafe {
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

pub fn load_pngs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    let results: Vec<Result<Image, DiffError>> = [path1.as_ref(), path2.as_ref()]
        .par_iter()
        .map(|path| load_png(path))
        .collect();

    let mut iter = results.into_iter();
    let img1 = iter.next().unwrap()?;
    let img2 = iter.next().unwrap()?;

    Ok((img1, img2))
}

pub fn save_png<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), DiffError> {
    save_png_with_compression(image, path, 0)
}

pub fn save_png_with_compression<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
) -> Result<(), DiffError> {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        if ctx.is_null() {
            return Err(DiffError::PngError(
                "Failed to create encoder context".into(),
            ));
        }
        let _guard = CtxGuard(ctx);

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
            return Err(DiffError::PngError("Failed to set IHDR".into()));
        }

        // Use internal buffer mode (faster than callback)
        if spng_set_option(ctx, spng_option_SPNG_ENCODE_TO_BUFFER, 1) != 0 {
            return Err(DiffError::PngError("Failed to set encode to buffer".into()));
        }

        // No filtering + no compression = fastest encode
        if spng_set_option(
            ctx,
            spng_option_SPNG_FILTER_CHOICE,
            spng_filter_choice_SPNG_DISABLE_FILTERING as c_int,
        ) != 0
        {
            return Err(DiffError::PngError("Failed to disable filtering".into()));
        }

        // Compression level 0-9 (0=store/fastest, 9=best compression)
        let level = compression.min(9) as c_int;
        if spng_set_option(ctx, spng_option_SPNG_IMG_COMPRESSION_LEVEL, level) != 0 {
            return Err(DiffError::PngError(
                "Failed to set compression level".into(),
            ));
        }

        let res = spng_encode_image(
            ctx,
            image.data.as_ptr() as *const _,
            image.data.len(),
            spng_format_SPNG_FMT_PNG as c_int,
            spng_encode_flags_SPNG_ENCODE_FINALIZE as c_int,
        );

        if res != 0 {
            let err_str = spng_strerror(res);
            let msg = if !err_str.is_null() {
                std::ffi::CStr::from_ptr(err_str)
                    .to_string_lossy()
                    .into_owned()
            } else {
                format!("Encode error: {}", res)
            };
            return Err(DiffError::PngError(msg));
        }

        // Get the internal buffer (owned by spng, freed with context)
        let mut len: usize = 0;
        let mut error: c_int = 0;
        let buf_ptr = spng_get_png_buffer(ctx, &mut len, &mut error);

        if buf_ptr.is_null() || error != 0 {
            return Err(DiffError::PngError("Failed to get PNG buffer".into()));
        }

        let output_slice = std::slice::from_raw_parts(buf_ptr as *const u8, len);

        let mut file = File::create(path.as_ref())?;
        file.write_all(output_slice)?;

        Ok(())
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
