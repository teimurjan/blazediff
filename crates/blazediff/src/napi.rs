//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::{diff, DiffError, DiffOptions, Image};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::path::Path;

/// Load two images in parallel, auto-detecting format from their extensions.
fn load_images<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> std::result::Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::load_image_pair(path1, path2)?)
}

/// Decode two encoded buffers in parallel, sniffing each format from its magic bytes.
fn load_image_buffers(
    image1: &[u8],
    image2: &[u8],
) -> std::result::Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::decode_image_pair(image1, image2)?)
}

/// Save an image, auto-detecting format from extension.
fn save_image<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
    quality: u8,
) -> std::result::Result<(), DiffError> {
    Ok(blazediff_shared::save_image(
        image,
        path,
        compression,
        quality,
    )?)
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
    /// Alternative RGB color for darkening differences
    pub diff_color_alt: Option<Vec<u8>>,
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
    /// Number of differing pixels
    pub diff_count: Option<u32>,
    /// `diff_count` as a percentage of the total
    pub diff_percentage: Option<f64>,
}

fn optional_rgb(value: Option<Vec<u8>>, label: &str) -> Result<Option<[u8; 3]>> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value.as_slice() {
        [r, g, b] => Ok(Some([*r, *g, *b])),
        _ => Err(Error::new(
            Status::InvalidArg,
            format!("{}: expected 3 channels, got {}", label, value.len()),
        )),
    }
}

fn compare_images(
    img1: Image,
    img2: Image,
    diff_output: Option<String>,
    options: Option<NapiDiffOptions>,
) -> Result<NapiDiffResult> {
    let opts = options.unwrap_or(NapiDiffOptions {
        threshold: None,
        antialiasing: None,
        diff_mask: None,
        diff_color_alt: None,
        compression: None,
        quality: None,
    });

    let threshold = opts.threshold.unwrap_or(0.1);
    let antialiasing = opts.antialiasing.unwrap_or(false);
    let diff_mask = opts.diff_mask.unwrap_or(false);
    let diff_color_alt = optional_rgb(opts.diff_color_alt, "diff_color_alt")?;
    let compression = opts.compression.unwrap_or(0);
    let quality = opts.quality.unwrap_or(90);

    // Check for size mismatch - can't diff images of different sizes
    if img1.width != img2.width || img1.height != img2.height {
        return Ok(NapiDiffResult {
            match_result: false,
            reason: Some("layout-diff".to_string()),
            diff_count: None,
            diff_percentage: None,
        });
    }

    let mut diff_options = DiffOptions {
        threshold,
        include_aa: !antialiasing,
        diff_mask,
        diff_color_alt,
        compression,
        ..Default::default()
    };

    let mut output_image = if diff_output.is_some() {
        Some(Image::new_uninit(img1.width, img1.height))
    } else {
        None
    };

    let result = diff(&img1, &img2, output_image.as_mut(), &diff_options)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Diff failed: {}", e)))?;

    // Save diff image if requested and images differ
    if !result.identical {
        if let (Some(output_path), Some(output)) = (&diff_output, &output_image) {
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

/// Compare two images from paths and optionally generate a diff image.
#[napi]
pub fn compare(
    base_path: String,
    compare_path: String,
    diff_output: Option<String>,
    options: Option<NapiDiffOptions>,
) -> Result<NapiDiffResult> {
    let (img1, img2) = load_images(&base_path, &compare_path).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {}", e),
        )
    })?;
    compare_images(img1, img2, diff_output, options)
}

/// Compare two encoded image buffers and optionally generate a diff image.
#[napi]
pub fn compare_buffers(
    base: &[u8],
    comparison: &[u8],
    diff_output: Option<String>,
    options: Option<NapiDiffOptions>,
) -> Result<NapiDiffResult> {
    let (img1, img2) = load_image_buffers(base, comparison).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {}", e),
        )
    })?;
    compare_images(img1, img2, diff_output, options)
}
