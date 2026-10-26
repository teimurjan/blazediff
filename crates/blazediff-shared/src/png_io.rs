//! PNG I/O: spng handles all decode and encode by default. The experimental
//! in-house [`blazediff_png`] codec is opt-in via
//! [`crate::blazediff_png_enabled`] — when enabled it takes the decode and
//! stored-block (level 0) encode paths, with spng staying as the defensive
//! decode fallback.

pub use crate::spng_decode::decode_spng;
use crate::spng_ffi::*;
use crate::{blazediff_png_enabled, Image, ImageError};
use memmap2::Mmap;
use std::fs::File;
use std::io::Write;
use std::os::raw::c_int;
use std::path::Path;

pub fn load_png<P: AsRef<Path>>(path: P) -> Result<Image, ImageError> {
    let file = File::open(path.as_ref())?;
    let file_data = unsafe { Mmap::map(&file)? };
    decode_png(&file_data)
}

pub fn decode_png(file_data: &[u8]) -> Result<Image, ImageError> {
    // When enabled, blazediff_png decodes every format spng accepts,
    // byte-identically except for spec-masked gray tRNS keys (see its
    // README), and is substantially faster (whole-buffer libdeflate
    // inflate, SIMD defilter); spng stays as a defensive fallback should the
    // codec ever reject an input spng would have taken. Off by default while
    // the codec is experimental.
    if blazediff_png_enabled() {
        if let Ok(img) = blazediff_png::decode(file_data) {
            return Ok(Image {
                data: img.data,
                width: img.width,
                height: img.height,
            });
        }
    }
    decode_spng(file_data)
}

pub fn load_pngs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), ImageError> {
    // `rayon::join` is a direct fork/join over two closures and runs the
    // first on the calling thread while a worker steals the second. It
    // avoids the iterator/Vec/collect machinery of `par_iter`, which adds
    // noticeable overhead (hundreds of µs) for two-task workloads — a
    // significant fraction of total time on small-image benchmarks.
    let (r1, r2) = rayon::join(|| load_png(path1.as_ref()), || load_png(path2.as_ref()));
    Ok((r1?, r2?))
}

pub fn save_png<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), ImageError> {
    save_png_with_compression(image, path, 0)
}

pub fn save_png_with_compression<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
) -> Result<(), ImageError> {
    let png_data = encode_png(image, compression as i32)?;
    let mut file = File::create(path.as_ref())?;
    file.write_all(&png_data)?;
    Ok(())
}

pub fn encode_png(image: &Image, compression_level: i32) -> Result<Vec<u8>, ImageError> {
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
            .map_err(|e| ImageError::Png(format!("blazediff_png encode failed: {e}")));
    }
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        if ctx.is_null() {
            return Err(ImageError::Png(
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
            return Err(ImageError::Png("Failed to set IHDR".into()));
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
            return Err(ImageError::Png(format!("Failed to encode image: {}", ret)));
        }

        let mut len: usize = 0;
        let mut error: c_int = 0;
        let buf = spng_get_png_buffer(ctx, &mut len, &mut error);

        if buf.is_null() || error != 0 {
            spng_ctx_free(ctx);
            return Err(ImageError::Png(format!(
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
