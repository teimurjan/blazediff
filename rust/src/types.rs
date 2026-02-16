//! Core types.

use serde::{Deserialize, Serialize};

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

    /// Create an image with uninitialized memory. Caller must fill all pixels before reading.
    /// Use this for output images that will be fully overwritten.
    pub fn new_uninit(width: u32, height: u32) -> Self {
        let len = (width * height * 4) as usize;
        let mut data = Vec::with_capacity(len);
        unsafe { data.set_len(len) };
        Self { data, width, height }
    }

    #[inline]
    pub fn as_u32(&self) -> &[u32] {
        // SAFETY: Vec<u8> with length divisible by 4 can be viewed as &[u32]
        unsafe { std::slice::from_raw_parts(self.data.as_ptr() as *const u32, self.data.len() / 4) }
    }

    #[inline]
    pub fn as_u32_mut(&mut self) -> &mut [u32] {
        unsafe {
            std::slice::from_raw_parts_mut(self.data.as_mut_ptr() as *mut u32, self.data.len() / 4)
        }
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

#[derive(Clone, Debug)]
pub struct DiffOptions {
    pub threshold: f64,      // 0.0-1.0, default 0.1
    pub include_aa: bool,    // count AA pixels as diffs
    pub alpha: f64,          // background opacity
    pub aa_color: [u8; 3],   // yellow
    pub diff_color: [u8; 3], // red
    pub diff_color_alt: Option<[u8; 3]>,
    pub diff_mask: bool, // transparent background mode
    pub compression: u8, // PNG compression level 0-9 (0=fastest, 9=smallest)
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            threshold: 0.1,
            include_aa: false,
            alpha: 0.1,
            aa_color: [255, 255, 0],
            diff_color: [255, 0, 0],
            diff_color_alt: None,
            diff_mask: false,
            compression: 0, // fastest by default
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub diff_count: u32,
    pub diff_percentage: f64,
    pub identical: bool,
}

impl DiffResult {
    pub fn new(diff_count: u32, total_pixels: u32) -> Self {
        let diff_percentage = if total_pixels > 0 {
            100.0 * (diff_count as f64) / (total_pixels as f64)
        } else {
            0.0
        };
        Self {
            diff_count,
            diff_percentage,
            identical: diff_count == 0,
        }
    }
}

#[derive(Debug)]
pub enum DiffError {
    SizeMismatch {
        img1_width: u32,
        img1_height: u32,
        img2_width: u32,
        img2_height: u32,
    },
    InvalidDataSize {
        expected: usize,
        actual: usize,
    },
    IoError(std::io::Error),
    PngError(String),
    JpegError(String),
    UnsupportedFormat(String),
}

impl std::fmt::Display for DiffError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DiffError::SizeMismatch {
                img1_width,
                img1_height,
                img2_width,
                img2_height,
            } => {
                write!(
                    f,
                    "Image sizes do not match: {}x{} vs {}x{}",
                    img1_width, img1_height, img2_width, img2_height
                )
            }
            DiffError::InvalidDataSize { expected, actual } => {
                write!(
                    f,
                    "Invalid data size: expected {}, got {}",
                    expected, actual
                )
            }
            DiffError::IoError(e) => write!(f, "IO error: {}", e),
            DiffError::PngError(e) => write!(f, "PNG error: {}", e),
            DiffError::JpegError(e) => write!(f, "JPEG error: {}", e),
            DiffError::UnsupportedFormat(e) => write!(f, "Unsupported format: {}", e),
        }
    }
}

impl std::error::Error for DiffError {}

impl From<std::io::Error> for DiffError {
    fn from(e: std::io::Error) -> Self {
        DiffError::IoError(e)
    }
}
