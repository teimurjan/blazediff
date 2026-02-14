//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::{
    diff, load_jpeg, load_jpegs, load_png, load_pngs, save_jpeg, save_png_with_compression,
    DiffError, DiffOptions, Image,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;
use std::path::Path;

/// Supported image formats
#[derive(Debug, Clone, Copy, PartialEq)]
enum ImageFormat {
    Png,
    Jpeg,
}

impl ImageFormat {
    fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
            _ => None,
        }
    }
}

/// Load two images in parallel, auto-detecting format
fn load_images<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> std::result::Result<(Image, Image), DiffError> {
    let fmt1 = ImageFormat::from_path(&path1).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path1.as_ref().display()))
    })?;
    let fmt2 = ImageFormat::from_path(&path2).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path2.as_ref().display()))
    })?;

    if fmt1 == fmt2 {
        return match fmt1 {
            ImageFormat::Png => load_pngs(&path1, &path2),
            ImageFormat::Jpeg => load_jpegs(&path1, &path2),
        };
    }

    let results: Vec<std::result::Result<Image, DiffError>> = [
        (path1.as_ref().to_path_buf(), fmt1),
        (path2.as_ref().to_path_buf(), fmt2),
    ]
    .par_iter()
    .map(|(path, fmt)| match fmt {
        ImageFormat::Png => load_png(path),
        ImageFormat::Jpeg => load_jpeg(path),
    })
    .collect();

    let mut iter = results.into_iter();
    Ok((iter.next().unwrap()?, iter.next().unwrap()?))
}

/// Save an image, auto-detecting format from extension
fn save_image<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
    quality: u8,
) -> std::result::Result<(), DiffError> {
    let format = ImageFormat::from_path(&path).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path.as_ref().display()))
    })?;
    match format {
        ImageFormat::Png => save_png_with_compression(image, path, compression),
        ImageFormat::Jpeg => save_jpeg(image, path, quality),
    }
}

/// Options for image comparison
#[napi(object)]
pub struct NapiDiffOptions {
    /// Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1
    pub threshold: Option<f64>,
    /// Enable anti-aliasing detection to exclude AA pixels from diff count
    pub antialiasing: Option<bool>,
    /// Output only differences with transparent background
    pub diff_mask: Option<bool>,
    /// PNG compression level (0-9, 0=fastest, 9=smallest). Default: 0
    pub compression: Option<u8>,
    /// JPEG quality (1-100). Default: 90
    pub quality: Option<u8>,
}

/// Result of image comparison
#[napi(object)]
pub struct NapiDiffResult {
    /// Whether the images match (identical within threshold)
    pub match_result: bool,
    /// Reason for mismatch: "pixel-diff", "layout-diff", or null if matched
    pub reason: Option<String>,
    /// Number of different pixels (only for pixel-diff)
    pub diff_count: Option<u32>,
    /// Percentage of different pixels (only for pixel-diff)
    pub diff_percentage: Option<f64>,
}

/// Compare two images and optionally generate a diff image.
///
/// Returns a result object with match status and diff details.
#[napi]
pub fn compare(
    base_path: String,
    compare_path: String,
    diff_output: Option<String>,
    options: Option<NapiDiffOptions>,
) -> Result<NapiDiffResult> {
    let opts = options.unwrap_or(NapiDiffOptions {
        threshold: None,
        antialiasing: None,
        diff_mask: None,
        compression: None,
        quality: None,
    });

    let threshold = opts.threshold.unwrap_or(0.1);
    let antialiasing = opts.antialiasing.unwrap_or(false);
    let diff_mask = opts.diff_mask.unwrap_or(false);
    let compression = opts.compression.unwrap_or(0);
    let quality = opts.quality.unwrap_or(90);

    // Load images
    let (img1, img2) = load_images(&base_path, &compare_path).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {}", e),
        )
    })?;

    // Check for size mismatch - can't diff images of different sizes
    if img1.width != img2.width || img1.height != img2.height {
        return Ok(NapiDiffResult {
            match_result: false,
            reason: Some("layout-diff".to_string()),
            diff_count: None,
            diff_percentage: None,
        });
    }

    let diff_options = DiffOptions {
        threshold,
        include_aa: !antialiasing,
        diff_mask,
        compression,
        ..Default::default()
    };

    let mut output_image = if diff_output.is_some() {
        Some(Image::new(img1.width, img1.height))
    } else {
        None
    };

    let result = diff(&img1, &img2, output_image.as_mut(), &diff_options)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Diff failed: {}", e)))?;

    // Save diff image if requested and images differ
    if !result.identical {
        if let (Some(ref output_path), Some(ref output)) = (&diff_output, &output_image) {
            save_image(output, output_path, compression, quality).map_err(|e| {
                Error::new(
                    Status::GenericFailure,
                    format!("Failed to save diff: {}", e),
                )
            })?;
        }
    }

    if result.identical {
        Ok(NapiDiffResult {
            match_result: true,
            reason: None,
            diff_count: None,
            diff_percentage: None,
        })
    } else {
        Ok(NapiDiffResult {
            match_result: false,
            reason: Some("pixel-diff".to_string()),
            diff_count: Some(result.diff_count),
            diff_percentage: Some(result.diff_percentage),
        })
    }
}
