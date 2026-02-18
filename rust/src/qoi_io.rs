//! QOI I/O via qoi-rust (https://github.com/aldanor/qoi-rust).

use crate::types::{DiffError, Image};
use memmap2::Mmap;
use rayon::prelude::*;
use std::fs::File;
use std::io::Write;
use std::path::Path;

pub fn load_qoi<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    let file = File::open(path.as_ref())?;
    let file_data = unsafe { Mmap::map(&file)? };

    let (header, pixels) = qoi::decode_to_vec(&file_data)
        .map_err(|e| DiffError::QoiError(e.to_string()))?;

    let width = header.width;
    let height = header.height;

    let data = match header.channels {
        qoi::Channels::Rgb => {
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for chunk in pixels.chunks_exact(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        qoi::Channels::Rgba => pixels,
    };

    Ok(Image {
        data,
        width,
        height,
    })
}

pub fn load_qois<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    let results: Vec<Result<Image, DiffError>> = [path1.as_ref(), path2.as_ref()]
        .par_iter()
        .map(|path| load_qoi(path))
        .collect();

    let mut iter = results.into_iter();
    let img1 = iter.next().unwrap()?;
    let img2 = iter.next().unwrap()?;

    Ok((img1, img2))
}

pub fn save_qoi<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), DiffError> {
    let encoded = qoi::encode_to_vec(&image.data, image.width, image.height)
        .map_err(|e| DiffError::QoiError(e.to_string()))?;

    let mut file = File::create(path.as_ref())?;
    file.write_all(&encoded)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qoi_roundtrip() {
        let mut img = Image::new(100, 100);
        for y in 0..100 {
            for x in 0..100 {
                let idx = (y * 100 + x) * 4;
                img.data[idx as usize] = (x * 255 / 100) as u8;
                img.data[idx as usize + 1] = (y * 255 / 100) as u8;
                img.data[idx as usize + 2] = 128;
                img.data[idx as usize + 3] = 255;
            }
        }

        let temp_path = "/tmp/blazediff_test.qoi";
        save_qoi(&img, temp_path).expect("Failed to save QOI");
        let loaded = load_qoi(temp_path).expect("Failed to load QOI");

        assert_eq!(loaded.width, 100);
        assert_eq!(loaded.height, 100);
        assert_eq!(loaded.data.len(), img.data.len());
        assert_eq!(loaded.data, img.data);

        std::fs::remove_file(temp_path).ok();
    }

}
