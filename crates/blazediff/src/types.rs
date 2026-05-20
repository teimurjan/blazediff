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

    /// Create an image whose pixel data is left uninitialized.
    ///
    /// Use this for diff-output buffers that the [`crate::diff`] pipeline
    /// fully overwrites — either by `clear_transparent` (diff_mask mode),
    /// by the deferred gray-fill pass (when at least one block differs and
    /// diff_mask is off), or by the hot pass writing changed blocks. The
    /// only call path that does not overwrite is the early "identical"
    /// short-circuit: in that case `result.identical` is true and every
    /// shipping front-end (CLI, N-API, Python, the WASM in-place copy)
    /// already skips reading the output buffer.
    ///
    /// Avoiding `vec![0u8; ...]` here saves a 64 MB memset per 4K-image
    /// diff. The OS's allocator typically hands us freshly-cleared pages
    /// for big allocations anyway, but tiny diffs (a few hundred KB) reuse
    /// arena memory whose contents are whatever the last call left behind
    /// — fine here, because the callers above respect the "identical →
    /// don't read" contract.
    pub fn new_uninit(width: u32, height: u32) -> Self {
        let size = (width as usize) * (height as usize) * 4;
        let mut data: Vec<u8> = Vec::with_capacity(size);
        // SAFETY: the new length matches the capacity we just reserved, the
        // element type (`u8`) has no validity requirements, and every byte
        // of this allocation is overwritten before being read on every
        // non-identical diff path. Identical-input callers skip the read.
        unsafe {
            data.set_len(size);
        }
        Self {
            data,
            width,
            height,
        }
    }

    #[inline]
    pub fn as_u32(&self) -> &[u32] {
        bytemuck::cast_slice(&self.data)
    }

    #[inline]
    pub fn as_u32_mut(&mut self) -> &mut [u32] {
        bytemuck::cast_slice_mut(&mut self.data)
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
    QoiError(String),
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
            DiffError::QoiError(e) => write!(f, "QOI error: {}", e),
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
