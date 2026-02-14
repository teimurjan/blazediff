//! JPEG I/O via libjpeg-turbo (TurboJPEG API).

use crate::turbojpeg_ffi::*;
use crate::types::{DiffError, Image};
use memmap2::Mmap;
use rayon::prelude::*;
use std::ffi::CStr;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::ptr;

/// RAII guard for TurboJPEG handle cleanup
struct TjHandle(tjhandle);

impl Drop for TjHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { tj3Destroy(self.0) }
        }
    }
}

/// Get error message from TurboJPEG handle
unsafe fn get_tj_error(handle: tjhandle) -> String {
    let err_ptr = tj3GetErrorStr(handle);
    if err_ptr.is_null() {
        "Unknown TurboJPEG error".to_string()
    } else {
        CStr::from_ptr(err_ptr).to_string_lossy().into_owned()
    }
}

/// Load a JPEG image from file into RGBA format
pub fn load_jpeg<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    let file = File::open(path.as_ref())?;
    let mmap = unsafe { Mmap::map(&file)? };

    unsafe {
        // Initialize decompressor
        let handle = tj3Init(TJINIT_TJINIT_DECOMPRESS as i32);
        if handle.is_null() {
            return Err(DiffError::JpegError(
                "Failed to create TurboJPEG decompressor".into(),
            ));
        }
        let _guard = TjHandle(handle);

        // Read JPEG header
        if tj3DecompressHeader(handle, mmap.as_ptr(), mmap.len()) != 0 {
            return Err(DiffError::JpegError(get_tj_error(handle)));
        }

        // Get image dimensions
        let width = tj3Get(handle, TJPARAM_TJPARAM_JPEGWIDTH as i32) as u32;
        let height = tj3Get(handle, TJPARAM_TJPARAM_JPEGHEIGHT as i32) as u32;

        if width == 0 || height == 0 {
            return Err(DiffError::JpegError("Invalid JPEG dimensions".into()));
        }

        // Allocate output buffer (RGBA = 4 bytes per pixel)
        let stride = (width * 4) as i32;
        let buf_size = (stride as u32 * height) as usize;
        let mut data: Vec<u8> = Vec::with_capacity(buf_size);
        data.set_len(buf_size);

        // Decompress to RGBA
        if tj3Decompress8(
            handle,
            mmap.as_ptr(),
            mmap.len(),
            data.as_mut_ptr(),
            stride,
            TJPF_TJPF_RGBA,
        ) != 0
        {
            return Err(DiffError::JpegError(get_tj_error(handle)));
        }

        Ok(Image {
            data,
            width,
            height,
        })
    }
}

/// Load two JPEG images in parallel
pub fn load_jpegs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    let results: Vec<Result<Image, DiffError>> = [path1.as_ref(), path2.as_ref()]
        .par_iter()
        .map(|path| load_jpeg(path))
        .collect();

    let mut iter = results.into_iter();
    let img1 = iter.next().unwrap()?;
    let img2 = iter.next().unwrap()?;

    Ok((img1, img2))
}

/// Save an RGBA image as JPEG with specified quality
pub fn save_jpeg<P: AsRef<Path>>(image: &Image, path: P, quality: u8) -> Result<(), DiffError> {
    unsafe {
        // Initialize compressor
        let handle = tj3Init(TJINIT_TJINIT_COMPRESS as i32);
        if handle.is_null() {
            return Err(DiffError::JpegError(
                "Failed to create TurboJPEG compressor".into(),
            ));
        }
        let _guard = TjHandle(handle);

        // Set quality (1-100)
        let quality = quality.clamp(1, 100) as i32;
        if tj3Set(handle, TJPARAM_TJPARAM_QUALITY as i32, quality) != 0 {
            return Err(DiffError::JpegError(get_tj_error(handle)));
        }

        // Set subsampling (4:2:0 for good compression)
        if tj3Set(handle, TJPARAM_TJPARAM_SUBSAMP as i32, TJSAMP_TJSAMP_420) != 0 {
            return Err(DiffError::JpegError(get_tj_error(handle)));
        }

        // Compress
        let mut jpeg_buf: *mut u8 = ptr::null_mut();
        let mut jpeg_size: usize = 0;
        let stride = (image.width * 4) as i32;

        if tj3Compress8(
            handle,
            image.data.as_ptr(),
            image.width as i32,
            stride,
            image.height as i32,
            TJPF_TJPF_RGBA,
            &mut jpeg_buf,
            &mut jpeg_size,
        ) != 0
        {
            return Err(DiffError::JpegError(get_tj_error(handle)));
        }

        // Write to file
        let jpeg_slice = std::slice::from_raw_parts(jpeg_buf, jpeg_size);
        let mut file = File::create(path.as_ref())?;
        file.write_all(jpeg_slice)?;

        // Free the buffer allocated by TurboJPEG
        tj3Free(jpeg_buf as *mut _);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jpeg_roundtrip() {
        // Create a simple test image
        let mut img = Image::new(100, 100);
        // Fill with a gradient
        for y in 0..100 {
            for x in 0..100 {
                let idx = (y * 100 + x) * 4;
                img.data[idx] = (x * 255 / 100) as u8; // R
                img.data[idx + 1] = (y * 255 / 100) as u8; // G
                img.data[idx + 2] = 128; // B
                img.data[idx + 3] = 255; // A
            }
        }

        // Save and reload
        let temp_path = "/tmp/blazediff_test.jpg";
        save_jpeg(&img, temp_path, 95).expect("Failed to save JPEG");
        let loaded = load_jpeg(temp_path).expect("Failed to load JPEG");

        assert_eq!(loaded.width, 100);
        assert_eq!(loaded.height, 100);

        // Clean up
        std::fs::remove_file(temp_path).ok();
    }
}
