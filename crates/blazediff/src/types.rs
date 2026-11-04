//! Core types.

use serde::{Deserialize, Serialize};

/// The RGBA8 image buffer, owned by [`blazediff_shared`] so every BlazeDiff
/// crate can speak it without depending on this one.
pub use blazediff_shared::Image;

/// Color difference metric.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ColorSpace {
    /// YIQ, the metric pixelmatch used before v8. `threshold` scales its squared distance.
    #[default]
    Yiq,
    /// pixelmatch 8's OKLab HyAB distance. `threshold` 1 is black vs white.
    Oklab,
}

impl std::str::FromStr for ColorSpace {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "yiq" => Ok(Self::Yiq),
            "oklab" => Ok(Self::Oklab),
            other => Err(format!(
                "Unknown color space: {}. Expected \"yiq\" or \"oklab\".",
                other
            )),
        }
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
    pub color_space: ColorSpace,
    /// One byte per pixel (width × height); pixels with a non-zero byte are skipped.
    pub ignore_mask: Option<Vec<u8>>,
    /// Report the largest diff count in any N×N window instead of the total.
    /// N is clamped to [1, min(width, height)].
    pub window_size: Option<u32>,
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
            color_space: ColorSpace::Yiq,
            ignore_mask: None,
            window_size: None,
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
    InvalidMaskSize {
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
            DiffError::InvalidMaskSize { expected, actual } => {
                write!(
                    f,
                    "Invalid ignore mask size: expected {}, got {}",
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

/// 1:1 with [`blazediff_shared::ImageError`], so the `Display` strings the CLI,
/// N-API, Python and JS front-ends print are unchanged by the codec crate
/// living elsewhere.
impl From<blazediff_shared::ImageError> for DiffError {
    fn from(e: blazediff_shared::ImageError) -> Self {
        use blazediff_shared::ImageError;
        match e {
            ImageError::Io(e) => DiffError::IoError(e),
            ImageError::Png(e) => DiffError::PngError(e),
            ImageError::Jpeg(e) => DiffError::JpegError(e),
            ImageError::Qoi(e) => DiffError::QoiError(e),
            ImageError::UnsupportedFormat(e) => DiffError::UnsupportedFormat(e),
        }
    }
}
