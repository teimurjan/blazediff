//! Core types.

use serde::{Deserialize, Serialize};

/// The RGBA8 image buffer, owned by [`blazediff_shared`] so every BlazeDiff
/// crate can speak it without depending on this one.
pub use blazediff_shared::Image;

/// Borrowed RGBA pixels, so bindings can diff caller memory without a copy.
#[derive(Clone, Copy)]
pub(crate) struct Px<'a> {
    pub data: &'a [u32],
    pub width: u32,
    pub height: u32,
}

impl<'a> Px<'a> {
    pub(crate) fn of(image: &'a Image) -> Self {
        Self {
            data: image.as_u32(),
            width: image.width,
            height: image.height,
        }
    }
}

/// Color difference metric.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Metric {
    /// YIQ, the metric pixelmatch used before v8. `threshold` scales its squared distance.
    #[default]
    Yiq,
    /// pixelmatch 8's OKLab HyAB distance. `threshold` 1 is black vs white.
    Oklab,
}

impl std::str::FromStr for Metric {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "yiq" => Ok(Self::Yiq),
            "oklab" => Ok(Self::Oklab),
            other => Err(format!(
                "Unknown metric: {}. Expected \"yiq\" or \"oklab\".",
                other
            )),
        }
    }
}

/// What the output shows under the diff pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Background {
    /// A faded gray copy of the first image.
    #[default]
    Faded,
    /// Nothing: unchanged pixels stay transparent.
    Transparent,
}

impl std::str::FromStr for Background {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "faded" => Ok(Self::Faded),
            "transparent" => Ok(Self::Transparent),
            other => Err(format!(
                "Unknown background: {}. Expected \"faded\" or \"transparent\".",
                other
            )),
        }
    }
}

/// How the diff output is drawn. Has no effect on the count.
#[derive(Clone, Debug)]
pub struct RenderOptions {
    /// Opacity of the faded background (0.0-1.0).
    pub alpha: f64,
    pub diff_color: [u8; 3],
    /// Color for pixels that get darker in the second image. Defaults to `diff_color`.
    pub diff_color_alt: Option<[u8; 3]>,
    /// Color for detected anti-aliased pixels.
    pub aa_color: [u8; 3],
    pub background: Background,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            alpha: 0.1,
            diff_color: [255, 0, 0],
            diff_color_alt: None,
            aa_color: [255, 255, 0],
            background: Background::Faded,
        }
    }
}

#[derive(Clone, Debug)]
pub struct DiffOptions {
    /// Color difference threshold (0.0-1.0). Lower is stricter.
    pub threshold: f64,
    /// Detect anti-aliased pixels and leave them out of the count.
    pub antialiasing: bool,
    pub metric: Metric,
    /// One byte per pixel (width × height); pixels with a non-zero byte are skipped.
    pub mask: Option<Vec<u8>>,
    /// Also report the N×N window with the most diff pixels.
    /// N is clamped to [1, min(width, height)].
    pub window: Option<u32>,
    pub render: RenderOptions,
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            threshold: 0.1,
            antialiasing: true,
            metric: Metric::Yiq,
            mask: None,
            window: None,
            render: RenderOptions::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

/// Top-left corner and diff count of the busiest window.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowHit {
    pub x: u32,
    pub y: u32,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DiffResult {
    Compared {
        /// Pixels that differ beyond `threshold`, after the mask and AA exclusion.
        count: u32,
        /// `count` as a percentage of all pixels.
        percentage: f64,
        /// True when `count` is 0.
        identical: bool,
        /// Set when [`DiffOptions::window`] is.
        #[serde(skip_serializing_if = "Option::is_none")]
        window: Option<WindowHit>,
    },
    DimensionMismatch {
        a: Size,
        b: Size,
    },
}

impl DiffResult {
    pub(crate) fn compared(count: u32, total_pixels: u32, window: Option<WindowHit>) -> Self {
        let percentage = if total_pixels > 0 {
            100.0 * (count as f64) / (total_pixels as f64)
        } else {
            0.0
        };
        Self::Compared {
            count,
            percentage,
            identical: count == 0,
            window,
        }
    }

    /// The diff count, or `None` for a dimension mismatch.
    pub fn count(&self) -> Option<u32> {
        match self {
            Self::Compared { count, .. } => Some(*count),
            Self::DimensionMismatch { .. } => None,
        }
    }

    /// True for a comparison with no diff pixels.
    pub fn is_identical(&self) -> bool {
        matches!(
            self,
            Self::Compared {
                identical: true,
                ..
            }
        )
    }
}

#[derive(Debug)]
pub enum DiffError {
    InvalidDataSize { expected: usize, actual: usize },
    InvalidMaskSize { expected: usize, actual: usize },
    IoError(std::io::Error),
    PngError(String),
    JpegError(String),
    QoiError(String),
    UnsupportedFormat(String),
}

impl std::fmt::Display for DiffError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
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
                    "Invalid mask size: expected {}, got {}",
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
