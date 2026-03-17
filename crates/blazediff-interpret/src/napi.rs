//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::{interpret, io::load_images, types};
use blazediff::DiffOptions;
use napi::bindgen_prelude::*;
use napi_derive::napi;

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
}

#[napi(object)]
pub struct NapiGradientStats {
    pub edge_score: f64,
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
pub struct NapiCompactRegion {
    pub position: String,
    pub change_type: String,
    pub confidence: f64,
    pub percentage: f64,
}

#[napi(object)]
pub struct NapiInterpretResult {
    pub summary: String,
    pub total_regions: u32,
    pub regions: Vec<NapiChangeRegion>,
    pub severity: String,
    pub diff_percentage: f64,
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct NapiCompactResult {
    pub summary: String,
    pub severity: String,
    pub diff_percentage: f64,
    pub regions: Vec<NapiCompactRegion>,
}

fn convert_region(r: &types::ChangeRegion) -> NapiChangeRegion {
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
            confidence: r.signals.confidence as f64,
        },
        confidence: r.confidence as f64,
        color_delta: NapiColorDeltaStats {
            mean_delta: r.color_delta.mean_delta as f64,
            max_delta: r.color_delta.max_delta as f64,
        },
        gradient: NapiGradientStats {
            edge_score: r.gradient.edge_score as f64,
        },
    }
}

fn convert_compact_region(r: &types::CompactRegion) -> NapiCompactRegion {
    NapiCompactRegion {
        position: r.position.to_string(),
        change_type: r.change_type.to_string(),
        confidence: r.confidence as f64,
        percentage: r.percentage,
    }
}

fn run_interpret(
    image1_path: &str,
    image2_path: &str,
    options: Option<NapiInterpretOptions>,
) -> Result<types::InterpretResult> {
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

    interpret(&img1, &img2, &diff_options).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Interpret failed: {}", e),
        )
    })
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
        total_regions: result.total_regions as u32,
        regions: result.regions.iter().map(convert_region).collect(),
        severity: result.severity.to_string(),
        diff_percentage: result.diff_percentage,
        width: result.width,
        height: result.height,
    })
}

/// Interpret the diff between two images, returning compact results.
#[napi]
pub fn interpret_images_compact(
    image1_path: String,
    image2_path: String,
    options: Option<NapiInterpretOptions>,
) -> Result<NapiCompactResult> {
    let result = run_interpret(&image1_path, &image2_path, options)?;
    let compact = result.to_compact();

    Ok(NapiCompactResult {
        summary: compact.summary,
        severity: compact.severity.to_string(),
        diff_percentage: compact.diff_percentage,
        regions: compact.regions.iter().map(convert_compact_region).collect(),
    })
}
