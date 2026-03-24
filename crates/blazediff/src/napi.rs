//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::{
    diff, interpret::html_report::generate_html_report, interpret::interpret,
    interpret::types as itypes, load_jpeg, load_jpegs, load_png, load_pngs, save_jpeg,
    save_png_with_compression, DiffError, DiffOptions, Image,
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
    Qoi,
}

impl ImageFormat {
    fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
            "qoi" => Some(ImageFormat::Qoi),
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
            ImageFormat::Qoi => crate::load_qois(&path1, &path2),
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
        ImageFormat::Qoi => crate::load_qoi(path),
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
        ImageFormat::Qoi => crate::save_qoi(image, path),
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
    /// Run structured interpretation instead of raw diff
    pub interpret: Option<bool>,
    /// Output format for diff: "png" (default) or "html" (interpret report)
    pub output_format: Option<String>,
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
    /// Structured interpretation (only when interpret option is true)
    pub interpretation: Option<NapiInterpretResult>,
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
        interpret: None,
        output_format: None,
    });

    let threshold = opts.threshold.unwrap_or(0.1);
    let antialiasing = opts.antialiasing.unwrap_or(false);
    let diff_mask = opts.diff_mask.unwrap_or(false);
    let compression = opts.compression.unwrap_or(0);
    let quality = opts.quality.unwrap_or(90);
    let output_format = opts.output_format.as_deref().unwrap_or("png");
    let run_interpret = opts.interpret.unwrap_or(false) || output_format == "html";

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
            interpretation: None,
        });
    }

    let diff_options = DiffOptions {
        threshold,
        include_aa: !antialiasing,
        diff_mask,
        compression,
        ..Default::default()
    };

    // Interpret mode: run structured analysis and return early
    if run_interpret {
        let result = interpret(&img1, &img2, &diff_options)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Interpret failed: {}", e)))?;

        // Generate HTML report if requested
        if output_format == "html" {
            if let Some(ref output_path) = diff_output {
                generate_html_report(&result, &base_path, &compare_path, output_path).map_err(
                    |e| {
                        Error::new(
                            Status::GenericFailure,
                            format!("Failed to write HTML report: {}", e),
                        )
                    },
                )?;
            }
        }

        let is_identical = result.total_regions == 0;
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
