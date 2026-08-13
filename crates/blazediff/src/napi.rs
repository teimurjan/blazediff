//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::{
    diff,
    interpret::types as itypes,
    interpret::{interpret, interpret_with_output},
    DiffError, DiffOptions, Image,
};
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
    /// Run structured interpretation instead of raw diff
    pub interpret: Option<bool>,
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
    /// Structured interpretation (only when interpret option is true)
    pub interpretation: Option<NapiInterpretResult>,
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
        interpret: None,
    });

    let threshold = opts.threshold.unwrap_or(0.1);
    let antialiasing = opts.antialiasing.unwrap_or(false);
    let diff_mask = opts.diff_mask.unwrap_or(false);
    let diff_color_alt = optional_rgb(opts.diff_color_alt, "diff_color_alt")?;
    let compression = opts.compression.unwrap_or(0);
    let quality = opts.quality.unwrap_or(90);
    let run_interpret = opts.interpret.unwrap_or(false);

    // Check for size mismatch - can't diff images of different sizes
    if img1.width != img2.width || img1.height != img2.height {
        return Ok(NapiDiffResult {
            match_result: false,
            reason: Some("layout-diff".to_string()),
            diff_count: None,
            diff_percentage: None,
            interpretation: None,
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

    // Interpret mode: generate the visualization and structured analysis in one pass.
    if run_interpret {
        // Interpretation reasons about which pixels changed, which only the
        let mut output_image = if diff_output.is_some() {
            Some(Image::new_uninit(img1.width, img1.height))
        } else {
            None
        };
        let result = interpret_with_output(&img1, &img2, output_image.as_mut(), &diff_options)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Interpret failed: {}", e)))?;

        let is_identical = result.diff_count == 0;
        if !is_identical {
            if let (Some(output_path), Some(output)) = (&diff_output, &output_image) {
                save_image(output, output_path, compression, quality).map_err(|e| {
                    Error::new(
                        Status::GenericFailure,
                        format!("Failed to save diff: {}", e),
                    )
                })?;
            }
        }

        let diff_count = result.diff_count;
        let diff_percentage = result.diff_percentage;
        let regions: Vec<NapiChangeRegion> = result.regions.iter().map(convert_region).collect();

        return Ok(NapiDiffResult {
            match_result: is_identical,
            reason: if is_identical {
                None
            } else {
                Some("pixel-diff".to_string())
            },
            diff_count: Some(diff_count),
            diff_percentage: Some(diff_percentage),
            interpretation: Some(NapiInterpretResult {
                summary: result.summary,
                diff_count: result.diff_count,
                total_regions: result.total_regions as u32,
                regions,
                severity: result.severity.to_string(),
                diff_percentage: result.diff_percentage,
                width: result.width,
                height: result.height,
            }),
        });
    }

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
            interpretation: None,
        })
    } else {
        Ok(NapiDiffResult {
            match_result: false,
            reason: Some("pixel-diff".to_string()),
            diff_count: Some(result.diff_count),
            diff_percentage: Some(result.diff_percentage),
            interpretation: None,
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

// ─── Interpret N-API bindings ────────────────────────────────────────────────

#[napi(object)]
pub struct NapiInterpretOptions {
    pub threshold: Option<f64>,
    pub antialiasing: Option<bool>,
}

#[napi(object)]
pub struct NapiBoundingBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct NapiShapeStats {
    pub fill_ratio: f64,
    pub border_ratio: f64,
    pub inner_fill_ratio: f64,
    pub center_density: f64,
    pub row_occupancy: f64,
    pub col_occupancy: f64,
}

#[napi(object)]
pub struct NapiColorDeltaStats {
    pub mean_delta: f64,
    pub max_delta: f64,
    pub delta_stddev: f64,
}

#[napi(object)]
pub struct NapiGradientStats {
    pub edge_score: f64,
    pub edge_score_img2: f64,
    pub edge_correlation: f64,
}

#[napi(object)]
pub struct NapiClassificationSignals {
    pub blends_with_bg_in_img1: bool,
    pub blends_with_bg_in_img2: bool,
    pub low_color_delta: bool,
    pub low_edge_change: bool,
    pub dense_fill: bool,
    pub sparse_fill: bool,
    pub tiny_region: bool,
    pub edges_correlated: bool,
    pub confidence: f64,
}

#[napi(object)]
pub struct NapiChangeRegion {
    pub bbox: NapiBoundingBox,
    pub pixel_count: u32,
    pub percentage: f64,
    pub position: String,
    pub shape: String,
    pub shape_stats: NapiShapeStats,
    pub change_type: String,
    pub signals: NapiClassificationSignals,
    pub confidence: f64,
    pub color_delta: NapiColorDeltaStats,
    pub gradient: NapiGradientStats,
}

#[napi(object)]
pub struct NapiInterpretResult {
    pub summary: String,
    pub diff_count: u32,
    pub total_regions: u32,
    pub regions: Vec<NapiChangeRegion>,
    pub severity: String,
    pub diff_percentage: f64,
    pub width: u32,
    pub height: u32,
}

fn convert_region(r: &itypes::ChangeRegion) -> NapiChangeRegion {
    NapiChangeRegion {
        bbox: NapiBoundingBox {
            x: r.bbox.x,
            y: r.bbox.y,
            width: r.bbox.width,
            height: r.bbox.height,
        },
        pixel_count: r.pixel_count,
        percentage: r.percentage,
        position: r.position.to_string(),
        shape: r.shape.to_string(),
        shape_stats: NapiShapeStats {
            fill_ratio: r.shape_stats.fill_ratio,
            border_ratio: r.shape_stats.border_ratio,
            inner_fill_ratio: r.shape_stats.inner_fill_ratio,
            center_density: r.shape_stats.center_density,
            row_occupancy: r.shape_stats.row_occupancy,
            col_occupancy: r.shape_stats.col_occupancy,
        },
        change_type: r.change_type.to_string(),
        signals: NapiClassificationSignals {
            blends_with_bg_in_img1: r.signals.blends_with_bg_in_img1,
            blends_with_bg_in_img2: r.signals.blends_with_bg_in_img2,
            low_color_delta: r.signals.low_color_delta,
            low_edge_change: r.signals.low_edge_change,
            dense_fill: r.signals.dense_fill,
            sparse_fill: r.signals.sparse_fill,
            tiny_region: r.signals.tiny_region,
            edges_correlated: r.signals.edges_correlated,
            confidence: r.signals.confidence as f64,
        },
        confidence: r.confidence as f64,
        color_delta: NapiColorDeltaStats {
            mean_delta: r.color_delta.mean_delta as f64,
            max_delta: r.color_delta.max_delta as f64,
            delta_stddev: r.color_delta.delta_stddev as f64,
        },
        gradient: NapiGradientStats {
            edge_score: r.gradient.edge_score as f64,
            edge_score_img2: r.gradient.edge_score_img2 as f64,
            edge_correlation: r.gradient.edge_correlation as f64,
        },
    }
}

fn run_interpret(
    image1_path: &str,
    image2_path: &str,
    options: Option<NapiInterpretOptions>,
) -> Result<itypes::InterpretResult> {
    let opts = options.unwrap_or(NapiInterpretOptions {
        threshold: None,
        antialiasing: None,
    });

    let threshold = opts.threshold.unwrap_or(0.1);
    let antialiasing = opts.antialiasing.unwrap_or(false);

    let (img1, img2) = load_images(image1_path, image2_path).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {}", e),
        )
    })?;

    let diff_options = DiffOptions {
        threshold,
        include_aa: !antialiasing,
        ..Default::default()
    };

    interpret(&img1, &img2, &diff_options)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Interpret failed: {}", e)))
}

/// Interpret the diff between two images, returning full structured results.
#[napi]
pub fn interpret_images(
    image1_path: String,
    image2_path: String,
    options: Option<NapiInterpretOptions>,
) -> Result<NapiInterpretResult> {
    let result = run_interpret(&image1_path, &image2_path, options)?;

    Ok(NapiInterpretResult {
        summary: result.summary,
        diff_count: result.diff_count,
        total_regions: result.total_regions as u32,
        regions: result.regions.iter().map(convert_region).collect(),
        severity: result.severity.to_string(),
        diff_percentage: result.diff_percentage,
        width: result.width,
        height: result.height,
    })
}
