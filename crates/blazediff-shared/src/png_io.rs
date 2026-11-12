//! PNG I/O: [`blazediff_png`] handles all encode. spng handles decode by
//! default; [`crate::blazediff_png_enabled`] opts decode into
//! [`blazediff_png`] too, with spng staying as the defensive fallback.

pub use crate::spng_decode::decode_spng;
use crate::{blazediff_png_enabled, Image, ImageError};
use memmap2::Mmap;
use std::fs::File;
use std::io::Write;
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

/// Encodes with the smallest lossless color mode: a palette for images of at
/// most 256 colors (a diff image has about 30), gray, RGB or RGBA otherwise.
/// Decoded pixels are identical either way. Level 0 writes stored blocks.
pub fn encode_png(image: &Image, compression_level: i32) -> Result<Vec<u8>, ImageError> {
    let compression = u8::try_from(compression_level)
        .map_err(|_| ImageError::Png(format!("Invalid compression level: {compression_level}")))?;
    // Borrow the RGBA8 buffer instead of cloning it into an owned Image.
    let png = blazediff_png::ImageRef {
        data: &image.data,
        width: image.width,
        height: image.height,
    };
    let options = blazediff_png::EncodeOptions {
        color: blazediff_png::ColorMode::Auto,
        compression,
        filter: blazediff_png::Filter::None,
        interlace: false,
    };
    blazediff_png::encode_ref(png, &options)
        .map_err(|e| ImageError::Png(format!("Failed to encode image: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ihdr_color_type(png: &[u8]) -> u8 {
        png[25]
    }

    fn image_of(width: u32, pixel: impl Fn(u32) -> [u8; 4]) -> Image {
        let mut img = Image::new(width, 1);
        for x in 0..width {
            img.data[x as usize * 4..][..4].copy_from_slice(&pixel(x));
        }
        img
    }

    #[test]
    fn few_colors_encode_as_palette_at_every_level() {
        let img = image_of(64, |x| {
            if x % 7 == 0 {
                [255, 0, 0, 255]
            } else {
                [240, 240, 240, 255]
            }
        });
        for level in [0, 1, 6] {
            let png = encode_png(&img, level).unwrap();
            assert_eq!(ihdr_color_type(&png), 3);
            assert_eq!(decode_spng(&png).unwrap().data, img.data);
        }
    }

    #[test]
    fn many_colors_fall_back_to_truecolor() {
        let img = image_of(300, |x| [x as u8, (x >> 8) as u8, 7, 128]);
        let png = encode_png(&img, 0).unwrap();
        assert_eq!(ihdr_color_type(&png), 6);
        assert_eq!(decode_spng(&png).unwrap().data, img.data);
    }

    #[test]
    fn negative_level_is_rejected() {
        assert!(encode_png(&Image::new(1, 1), -1).is_err());
    }

    #[test]
    fn test_image_creation() {
        let img = Image::new(100, 100);
        assert_eq!(img.width, 100);
        assert_eq!(img.height, 100);
        assert_eq!(img.data.len(), 100 * 100 * 4);
    }
}
