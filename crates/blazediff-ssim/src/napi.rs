//! N-API bindings for `@blazediff/ssim-native`.
//!
//! Where `blazediff`'s binding exposes one knob per metric (`metric`,
//! `minScore`, `ssimWindowSize`), this one exposes the whole crate: `k1`, `k2`,
//! `bitDepth`, MS-SSIM weights and pooling method, Hitchhiker's stride and CoV
//! pooling, every `perceptual_ssim` dial, and the local score map itself.
//!
//! Decoding comes from `blazediff-shared`, so paths and encoded buffers work the
//! same way they do in `@blazediff/core-native`: PNG, JPEG and QOI, detected by
//! extension for paths and by magic bytes for buffers.

use crate::{
    hitchhikers_ssim, ms_ssim, perceptual_ssim, render_map as render_map_into, ssim, ColorSpace,
    HitchhikersOptions, MsSsimMethod, MsSsimOptions, PerceptualOptions, Plane, Pooling, Rgba8,
    SsimError, SsimOptions, SsimOutcome, DEFAULT_WEIGHTS,
};
use blazediff_shared::Image;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// ─── Metric ──────────────────────────────────────────────────────────────────

/// Which member of the family to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Metric {
    Ssim,
    MsSsim,
    HitchhikersSsim,
    PerceptualSsim,
}

impl Metric {
    /// Canonical name, as accepted below and echoed back in the result.
    fn as_str(self) -> &'static str {
        match self {
            Metric::Ssim => "ssim",
            Metric::MsSsim => "ms-ssim",
            Metric::HitchhikersSsim => "hitchhikers-ssim",
            Metric::PerceptualSsim => "perceptual-ssim",
        }
    }

    /// Every accepted spelling, matching the aliases `blazediff`'s CLI takes.
    fn parse(name: &str) -> Option<Self> {
        match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
            "ssim" => Some(Metric::Ssim),
            "ms-ssim" | "msssim" | "multiscale-ssim" => Some(Metric::MsSsim),
            "hitchhikers-ssim" | "hitchhikers" | "hssim" => Some(Metric::HitchhikersSsim),
            "perceptual-ssim" | "perceptual" => Some(Metric::PerceptualSsim),
            _ => None,
        }
    }

    const NAMES: [&'static str; 4] = ["ssim", "ms-ssim", "hitchhikers-ssim", "perceptual-ssim"];
}

// ─── Options ─────────────────────────────────────────────────────────────────

/// Knobs specific to `ms-ssim`.
#[napi(object)]
pub struct NapiMsSsimOptions {
    /// Per-scale weights; the length sets the number of scales.
    /// Default: `[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]`.
    pub weights: Option<Vec<f64>>,
    /// `"product"` (default) or `"weighted-sum"`. Product returns `NaN` for
    /// globally anticorrelated content, which is what both references do.
    pub method: Option<String>,
}

/// Knobs specific to `hitchhikers-ssim`.
#[napi(object)]
pub struct NapiHitchhikersOptions {
    /// Distance between window origins. Omit for non-overlapping windows.
    pub window_stride: Option<u32>,
    /// Pool with `1 - stddev/mean` instead of the plain mean. Default: true.
    pub cov_pooling: Option<bool>,
}

/// Knobs specific to `perceptual-ssim`. With all of them left out this
/// reduces bit-identically to `ms-ssim`.
#[napi(object)]
pub struct NapiPerceptualOptions {
    pub weights: Option<Vec<f64>>,
    /// `"product"` (default) or `"weighted-sum"`.
    pub method: Option<String>,
    /// `"gamma-luma"` (default) or `"lab"`. Only `"lab"` can see colour.
    pub color: Option<String>,
    /// Weight on each chroma channel relative to lightness. Default: 0.
    pub chroma_weight: Option<f64>,
    /// Extra octaves of downscaling applied to a*/b*. Default: 0.
    pub chroma_subsample: Option<u32>,
    /// `"mean"` (default) or `"mad"` for mean-absolute-deviation pooling.
    pub pooling: Option<String>,
    /// λ in the MAD pooling. Default: 1.
    pub deviation_weight: Option<f64>,
}

/// Everything a comparison takes.
#[napi(object)]
pub struct NapiSsimOptions {
    /// One of "ssim", "ms-ssim", "hitchhikers-ssim", "perceptual-ssim".
    /// Default: "ssim".
    pub metric: Option<String>,
    /// Score at or above which the images count as identical. Default: 1.
    pub min_score: Option<f64>,
    /// Side of the local window. Default: 11.
    pub window_size: Option<u32>,
    /// Luminance stability constant. Default: 0.01.
    pub k1: Option<f64>,
    /// Contrast stability constant. Default: 0.03.
    pub k2: Option<f64>,
    /// Sample bit depth, setting `L = 2^bitDepth - 1`. Default: 8.
    pub bit_depth: Option<u32>,
    /// Return the local score map alongside the score. Default: false —
    /// the map is a copy, and most callers only want the number.
    pub return_map: Option<bool>,
    /// PNG compression level (0-9) for a rendered map. Default: 0.
    pub compression: Option<u8>,
    /// JPEG quality (1-100) for a rendered map. Default: 90.
    pub quality: Option<u8>,
    pub ms_ssim: Option<NapiMsSsimOptions>,
    pub hitchhikers: Option<NapiHitchhikersOptions>,
    pub perceptual: Option<NapiPerceptualOptions>,
}

/// A pooled score and, on request, the map it came from.
#[napi(object)]
pub struct NapiSsimResult {
    /// Whether `score >= minScore`.
    pub match_result: bool,
    /// `null` on a match, otherwise "score-below-threshold".
    pub reason: Option<String>,
    pub metric: String,
    /// Pooled similarity. 1 means identical.
    pub score: f64,
    /// Map windows scoring below `minScore`.
    pub below_count: u32,
    /// Those windows as a percentage of the map.
    pub below_percentage: f64,
    /// Row-major local scores; present only when `returnMap` is set.
    pub map: Option<Float32Array>,
    pub map_width: u32,
    pub map_height: u32,
}

// ─── Option conversion ───────────────────────────────────────────────────────

fn invalid(message: impl AsRef<str>) -> Error {
    Error::new(Status::InvalidArg, message.as_ref().to_string())
}

fn parse_method(name: &str) -> Result<MsSsimMethod> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "product" => Ok(MsSsimMethod::Product),
        "weighted-sum" | "weightedsum" | "sum" => Ok(MsSsimMethod::WeightedSum),
        other => Err(invalid(format!(
            "Unknown pooling method '{other}'. Expected one of: product, weighted-sum"
        ))),
    }
}

fn parse_color_space(name: &str) -> Result<ColorSpace> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "gamma-luma" | "luma" => Ok(ColorSpace::GammaLuma),
        "lab" => Ok(ColorSpace::Lab),
        other => Err(invalid(format!(
            "Unknown color space '{other}'. Expected one of: gamma-luma, lab"
        ))),
    }
}

fn parse_pooling(name: &str) -> Result<Pooling> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "mean" => Ok(Pooling::Mean),
        "mad" | "mean-absolute-deviation" => Ok(Pooling::MeanAbsoluteDeviation),
        other => Err(invalid(format!(
            "Unknown pooling '{other}'. Expected one of: mean, mad"
        ))),
    }
}

fn metric_of(options: &Option<NapiSsimOptions>) -> Result<Metric> {
    let Some(name) = options.as_ref().and_then(|o| o.metric.as_deref()) else {
        return Ok(Metric::Ssim);
    };
    Metric::parse(name).ok_or_else(|| {
        invalid(format!(
            "Unknown metric '{name}'. Expected one of: {}",
            Metric::NAMES.join(", ")
        ))
    })
}

fn shared_options(options: &Option<NapiSsimOptions>) -> Result<SsimOptions> {
    let defaults = SsimOptions::default();
    let Some(options) = options else {
        return Ok(defaults);
    };
    let window_size = options.window_size.unwrap_or(defaults.window_size as u32);
    if window_size == 0 {
        return Err(invalid("windowSize must be greater than 0"));
    }
    Ok(SsimOptions {
        window_size: window_size as usize,
        k1: options.k1.unwrap_or(defaults.k1),
        k2: options.k2.unwrap_or(defaults.k2),
        bit_depth: options.bit_depth.unwrap_or(defaults.bit_depth),
    })
}

fn weights_or_default(weights: Option<Vec<f64>>) -> Result<Vec<f64>> {
    match weights {
        None => Ok(DEFAULT_WEIGHTS.to_vec()),
        Some(weights) if weights.is_empty() => Err(invalid("weights must not be empty")),
        Some(weights) => Ok(weights),
    }
}

fn ms_ssim_options(options: &Option<NapiSsimOptions>) -> Result<MsSsimOptions> {
    let Some(source) = options.as_ref().and_then(|o| o.ms_ssim.as_ref()) else {
        return Ok(MsSsimOptions::default());
    };
    Ok(MsSsimOptions {
        weights: weights_or_default(source.weights.clone())?,
        method: match source.method.as_deref() {
            Some(name) => parse_method(name)?,
            None => MsSsimMethod::default(),
        },
    })
}

fn hitchhikers_options(options: &Option<NapiSsimOptions>) -> Result<HitchhikersOptions> {
    let Some(source) = options.as_ref().and_then(|o| o.hitchhikers.as_ref()) else {
        return Ok(HitchhikersOptions::default());
    };
    if source.window_stride == Some(0) {
        return Err(invalid("windowStride must be greater than 0"));
    }
    Ok(HitchhikersOptions {
        window_stride: source.window_stride.map(|stride| stride as usize),
        cov_pooling: source.cov_pooling.unwrap_or(true),
    })
}

fn perceptual_options(options: &Option<NapiSsimOptions>) -> Result<PerceptualOptions> {
    let defaults = PerceptualOptions::default();
    let Some(source) = options.as_ref().and_then(|o| o.perceptual.as_ref()) else {
        return Ok(defaults);
    };
    Ok(PerceptualOptions {
        weights: weights_or_default(source.weights.clone())?,
        method: match source.method.as_deref() {
            Some(name) => parse_method(name)?,
            None => defaults.method,
        },
        color: match source.color.as_deref() {
            Some(name) => parse_color_space(name)?,
            None => defaults.color,
        },
        chroma_weight: source.chroma_weight.unwrap_or(defaults.chroma_weight),
        chroma_subsample: source.chroma_subsample.unwrap_or(defaults.chroma_subsample),
        pooling: match source.pooling.as_deref() {
            Some(name) => parse_pooling(name)?,
            None => defaults.pooling,
        },
        deviation_weight: source.deviation_weight.unwrap_or(defaults.deviation_weight),
    })
}

// ─── Running a metric ────────────────────────────────────────────────────────

/// Every way a metric can refuse is the caller handing it something it cannot
/// work with — a mismatched pair, an image below the metric's floor, or
/// options it cannot honour — so they all surface as `InvalidArg`, carrying
/// the crate's message verbatim.
impl From<SsimError> for Error {
    fn from(error: SsimError) -> Self {
        Error::new(Status::InvalidArg, error.to_string())
    }
}

/// Borrow an [`Image`]'s pixels in the shape the metrics take.
fn view(image: &Image) -> Rgba8<'_> {
    Rgba8::new(&image.data, image.width as usize, image.height as usize)
}

/// Map windows scoring below `floor`.
///
/// The floor is `minScore`, a policy of this binding rather than of the
/// metrics, which have no opinion about what counts as "different enough".
#[inline]
fn count_below(values: &[f32], floor: f32) -> u32 {
    values.iter().filter(|value| **value < floor).count() as u32
}

fn run(
    metric: Metric,
    image1: Rgba8<'_>,
    image2: Rgba8<'_>,
    options: &Option<NapiSsimOptions>,
) -> Result<SsimOutcome> {
    let shared = shared_options(options)?;

    // Only perceptual_ssim sees colour; the rest reduce to luma first.
    if metric == Metric::PerceptualSsim {
        let perceptual = perceptual_options(options)?;
        return Ok(perceptual_ssim(image1, image2, &shared, &perceptual)?);
    }

    let plane1 = Plane::from_rgba8(image1)?;
    let plane2 = Plane::from_rgba8(image2)?;

    Ok(match metric {
        Metric::Ssim => ssim(&plane1, &plane2, &shared)?,
        Metric::MsSsim => ms_ssim(&plane1, &plane2, &shared, &ms_ssim_options(options)?)?,
        Metric::HitchhikersSsim => {
            hitchhikers_ssim(&plane1, &plane2, &shared, &hitchhikers_options(options)?)?
        }
        Metric::PerceptualSsim => unreachable!("handled above"),
    })
}

fn shape(
    metric: Metric,
    outcome: SsimOutcome,
    options: &Option<NapiSsimOptions>,
) -> NapiSsimResult {
    let min_score = options.as_ref().and_then(|o| o.min_score).unwrap_or(1.0);
    let below_count = count_below(&outcome.map, min_score as f32);
    let below_percentage = if outcome.map.is_empty() {
        0.0
    } else {
        (below_count as f64 / outcome.map.len() as f64) * 100.0
    };
    // NaN fails every comparison, which is the right answer here: `ms-ssim`
    // with product pooling returns NaN for globally anticorrelated content,
    // and that is emphatically not a match.
    let match_result = outcome.score >= min_score;
    let return_map = options.as_ref().and_then(|o| o.return_map).unwrap_or(false);

    NapiSsimResult {
        match_result,
        reason: if match_result {
            None
        } else {
            Some("score-below-threshold".to_string())
        },
        metric: metric.as_str().to_string(),
        score: outcome.score,
        below_count,
        below_percentage,
        map_width: outcome.map_width as u32,
        map_height: outcome.map_height as u32,
        // Moved, not copied — the map is one f32 per window and callers who
        // don't ask for it shouldn't pay to marshal it.
        map: return_map.then(|| Float32Array::new(outcome.map)),
    }
}

/// Render the local map into `path`, at the size of the compared images.
fn write_map(
    path: &str,
    width: u32,
    height: u32,
    outcome: &SsimOutcome,
    options: &Option<NapiSsimOptions>,
) -> Result<()> {
    let mut image = Image::new(width, height);
    render_map_into(
        &mut image.data,
        width as usize,
        height as usize,
        &outcome.map,
        outcome.map_width,
        outcome.map_height,
    );
    let compression = options.as_ref().and_then(|o| o.compression).unwrap_or(0);
    let quality = options.as_ref().and_then(|o| o.quality).unwrap_or(90);
    blazediff_shared::save_image(&image, path, compression, quality)
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to save map: {e}")))
}

fn compare_images(
    image1: Image,
    image2: Image,
    map_output: Option<String>,
    options: Option<NapiSsimOptions>,
) -> Result<NapiSsimResult> {
    let metric = metric_of(&options)?;
    let outcome = run(metric, view(&image1), view(&image2), &options)?;

    if let Some(path) = &map_output {
        write_map(path, image1.width, image1.height, &outcome, &options)?;
    }

    Ok(shape(metric, outcome, &options))
}

// ─── Exported functions ──────────────────────────────────────────────────────

/// Compare two image files, optionally rendering the local score map to a path.
#[napi]
pub fn compare(
    base_path: String,
    compare_path: String,
    map_output: Option<String>,
    options: Option<NapiSsimOptions>,
) -> Result<NapiSsimResult> {
    let (image1, image2) =
        blazediff_shared::load_image_pair(&base_path, &compare_path).map_err(|e| {
            Error::new(
                Status::GenericFailure,
                format!("Failed to load images: {e}"),
            )
        })?;
    compare_images(image1, image2, map_output, options)
}

/// Compare two encoded image buffers (PNG, JPEG or QOI).
#[napi]
pub fn compare_buffers(
    base: &[u8],
    comparison: &[u8],
    map_output: Option<String>,
    options: Option<NapiSsimOptions>,
) -> Result<NapiSsimResult> {
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {e}"),
        )
    })?;
    compare_images(image1, image2, map_output, options)
}

/// Compare two raw RGBA8 buffers — no decoding, the crate's native shape.
#[napi]
pub fn compare_rgba(
    base: &[u8],
    comparison: &[u8],
    width: u32,
    height: u32,
    options: Option<NapiSsimOptions>,
) -> Result<NapiSsimResult> {
    let metric = metric_of(&options)?;
    let (width, height) = (width as usize, height as usize);
    let outcome = run(
        metric,
        Rgba8::new(base, width, height),
        Rgba8::new(comparison, width, height),
        &options,
    )?;
    Ok(shape(metric, outcome, &options))
}

/// Paint a local score map into a fresh RGBA8 buffer, dark where the score is
/// low. Nearest-neighbour stretched to `width` x `height`.
#[napi]
pub fn render_map(
    map: Float32Array,
    map_width: u32,
    map_height: u32,
    width: u32,
    height: u32,
) -> Result<Buffer> {
    let (width, height) = (width as usize, height as usize);
    let mut output = vec![0u8; width * height * 4];
    render_map_into(
        &mut output,
        width,
        height,
        map.as_ref(),
        map_width as usize,
        map_height as usize,
    );
    Ok(output.into())
}

/// Every metric name this binding accepts, for feature detection.
#[napi]
pub fn metrics() -> Vec<String> {
    Metric::NAMES.iter().map(|name| name.to_string()).collect()
}
