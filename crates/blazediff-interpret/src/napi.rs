//! N-API bindings for `@blazediff/interpret-native`.
//!
//! This crate sits above both producers, so the binding can run either of them
//! and interpret the result: a pixel diff for exact regions, a similarity
//! metric for a coarse map. Both come out as the same `InterpretResult`.

use crate::{interpret, interpret_diff, ChangeSource};
use blazediff::DiffOptions;
use blazediff_shared::Image;
use blazediff_ssim::{
    hitchhikers_ssim, ms_ssim, ssim, HitchhikersOptions, MsSsimOptions, Plane, Rgba8, SsimOptions,
};
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Score at or below which a map window counts as changed when locating
/// regions with a similarity metric.
const DEFAULT_REGION_FLOOR: f64 = 0.99;

/// Options for the diff-driven path.
#[napi(object)]
pub struct NapiInterpretOptions {
    /// Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1
    pub threshold: Option<f64>,
    /// Enable anti-aliasing detection to exclude AA pixels. Default: false
    pub antialiasing: Option<bool>,
    /// PNG compression level (0-9) for a written diff image. Default: 0
    pub compression: Option<u8>,
    /// JPEG quality (1-100) for a written diff image. Default: 90
    pub quality: Option<u8>,
}

/// Options for the metric-driven path.
#[napi(object)]
pub struct NapiSsimInterpretOptions {
    /// One of "ssim", "ms-ssim", "hitchhikers-ssim". Default: "ssim"
    pub metric: Option<String>,
    /// Local window size. Default: 11
    pub window_size: Option<u32>,
    /// Score at or below which a map window counts as changed. Default: 0.99
    pub region_floor: Option<f64>,
}

/// A region supplied by the caller, in image coordinates.
#[napi(object)]
pub struct NapiRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

fn diff_options(options: &Option<NapiInterpretOptions>) -> DiffOptions {
    let defaults = DiffOptions::default();
    let Some(options) = options else {
        return defaults;
    };
    DiffOptions {
        threshold: options.threshold.unwrap_or(defaults.threshold),
        // The N-API surface calls it `antialiasing` where the core calls the
        // inverse `include_aa`, matching @blazediff/core-native.
        include_aa: !options.antialiasing.unwrap_or(false),
        compression: options.compression.unwrap_or(defaults.compression),
        ..defaults
    }
}

fn load(base: &str, comparison: &str) -> Result<(Image, Image)> {
    blazediff_shared::load_image_pair(base, comparison).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {e}"),
        )
    })
}

fn to_value(result: crate::InterpretResult) -> Result<serde_json::Value> {
    serde_json::to_value(&result)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to serialize: {e}")))
}

fn interpret_err(e: crate::InterpretError) -> Error {
    Error::new(Status::InvalidArg, e.to_string())
}

/// Interpret the pixel diff between two images, optionally writing the
/// visualization to `diff_output`.
#[napi]
pub fn interpret_images(
    base_path: String,
    compare_path: String,
    diff_output: Option<String>,
    options: Option<NapiInterpretOptions>,
) -> Result<serde_json::Value> {
    let (image1, image2) = load(&base_path, &compare_path)?;
    let opts = diff_options(&options);

    let mut output = diff_output
        .as_ref()
        .map(|_| Image::new_uninit(image1.width, image1.height));
    let result = interpret_diff(&image1, &image2, output.as_mut(), &opts).map_err(interpret_err)?;

    if let (Some(path), Some(image)) = (&diff_output, &output) {
        if result.diff_count > 0 {
            let quality = options.as_ref().and_then(|o| o.quality).unwrap_or(90);
            blazediff_shared::save_image(image, path, opts.compression, quality).map_err(|e| {
                Error::new(Status::GenericFailure, format!("Failed to save diff: {e}"))
            })?;
        }
    }

    to_value(result)
}

/// Interpret two encoded image buffers (PNG, JPEG or QOI).
#[napi]
pub fn interpret_buffers(
    base: &[u8],
    comparison: &[u8],
    options: Option<NapiInterpretOptions>,
) -> Result<serde_json::Value> {
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {e}"),
        )
    })?;
    let result =
        interpret_diff(&image1, &image2, None, &diff_options(&options)).map_err(interpret_err)?;
    to_value(result)
}

/// Interpret two images, locating the regions with a similarity metric instead
/// of a pixel diff.
///
/// The map's grid is coarse, so the boxes are blocky; the statistics are not,
/// because each box is refined against the source pixels before it is measured.
#[napi]
pub fn interpret_ssim(
    base_path: String,
    compare_path: String,
    options: Option<NapiSsimInterpretOptions>,
) -> Result<serde_json::Value> {
    let (image1, image2) = load(&base_path, &compare_path)?;

    let mut shared = SsimOptions::default();
    if let Some(size) = options.as_ref().and_then(|o| o.window_size) {
        if size == 0 {
            return Err(Error::new(
                Status::InvalidArg,
                "windowSize must be greater than 0",
            ));
        }
        shared.window_size = size as usize;
    }

    let plane = |image: &Image| {
        Plane::from_rgba8(Rgba8::new(
            &image.data,
            image.width as usize,
            image.height as usize,
        ))
        .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))
    };
    let (plane1, plane2) = (plane(&image1)?, plane(&image2)?);

    let metric = options
        .as_ref()
        .and_then(|o| o.metric.as_deref())
        .unwrap_or("ssim")
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-");
    let outcome = match metric.as_str() {
        "ssim" => ssim(&plane1, &plane2, &shared),
        "ms-ssim" | "msssim" | "multiscale-ssim" => {
            ms_ssim(&plane1, &plane2, &shared, &MsSsimOptions::default())
        }
        "hitchhikers-ssim" | "hitchhikers" | "hssim" => {
            hitchhikers_ssim(&plane1, &plane2, &shared, &HitchhikersOptions::default())
        }
        other => {
            return Err(Error::new(
                Status::InvalidArg,
                format!(
                    "Unknown metric '{other}'. Expected one of: ssim, ms-ssim, hitchhikers-ssim"
                ),
            ))
        }
    }
    .map_err(|e| Error::new(Status::InvalidArg, e.to_string()))?;

    let floor = options
        .as_ref()
        .and_then(|o| o.region_floor)
        .unwrap_or(DEFAULT_REGION_FLOOR) as f32;

    let result = interpret(
        &image1,
        &image2,
        ChangeSource::Ssim {
            outcome: &outcome,
            floor,
        },
    )
    .map_err(interpret_err)?;
    to_value(result)
}

/// Interpret regions the caller already knows about.
#[napi]
pub fn interpret_regions(
    base_path: String,
    compare_path: String,
    regions: Vec<NapiRegion>,
) -> Result<serde_json::Value> {
    let (image1, image2) = load(&base_path, &compare_path)?;
    let boxes: Vec<crate::BoundingBox> = regions
        .into_iter()
        .map(|r| crate::BoundingBox {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        })
        .collect();
    let result =
        interpret(&image1, &image2, ChangeSource::Regions(&boxes)).map_err(interpret_err)?;
    to_value(result)
}
