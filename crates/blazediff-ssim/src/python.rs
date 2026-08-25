//! PyO3 bindings for the `blazediff-ssim` wheel.
//!
//! Mirrors `napi.rs` one-for-one: the same five entry points, the same knobs,
//! the same result shape. Where the N-API surface groups the metric-specific
//! options into nested objects (`msSsim`, `hitchhikers`, `perceptual`), this one
//! flattens them into keyword arguments — no two of those groups ever apply to
//! the same metric, so the names cannot collide, and flat keywords are what
//! `blazediff.compare` already does.
//!
//! Decoding comes from `blazediff-shared`, so paths and encoded buffers behave
//! exactly as they do in `@blazediff/ssim-native`: PNG, JPEG and QOI, detected
//! by extension for paths and by magic bytes for buffers.

use crate::{
    hitchhikers_ssim, ms_ssim, perceptual_ssim, render_map as render_map_into, ssim, ColorSpace,
    HitchhikersOptions, MsSsimMethod, MsSsimOptions, PerceptualOptions, Plane, Pooling, Rgba8,
    SsimError, SsimOptions, SsimOutcome, DEFAULT_WEIGHTS,
};
use blazediff_shared::Image;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

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

/// Every knob the `compare*` functions take, in one place.
///
/// The three `compare*` signatures below restate these as keyword-only
/// arguments — Rust's field-init shorthand means each of them builds this with
/// a single struct literal, so the parsing rules stay in one implementation.
struct Options<'a> {
    metric: Option<&'a str>,
    min_score: Option<f64>,
    window_size: Option<u32>,
    k1: Option<f64>,
    k2: Option<f64>,
    bit_depth: Option<u32>,
    return_map: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
    weights: Option<Vec<f64>>,
    method: Option<&'a str>,
    window_stride: Option<u32>,
    cov_pooling: Option<bool>,
    color: Option<&'a str>,
    chroma_weight: Option<f64>,
    chroma_subsample: Option<u32>,
    pooling: Option<&'a str>,
    deviation_weight: Option<f64>,
}

fn invalid(message: impl AsRef<str>) -> PyErr {
    PyValueError::new_err(message.as_ref().to_string())
}

/// Every way a metric can refuse is the caller handing it something it cannot
/// work with — a mismatched pair, an image below the metric's floor, or options
/// it cannot honour — so they all surface as `ValueError`, carrying the crate's
/// message verbatim.
impl From<SsimError> for PyErr {
    fn from(error: SsimError) -> Self {
        PyValueError::new_err(error.to_string())
    }
}

fn parse_method(name: &str) -> PyResult<MsSsimMethod> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "product" => Ok(MsSsimMethod::Product),
        "weighted-sum" | "weightedsum" | "sum" => Ok(MsSsimMethod::WeightedSum),
        other => Err(invalid(format!(
            "Unknown pooling method '{other}'. Expected one of: product, weighted-sum"
        ))),
    }
}

fn parse_color_space(name: &str) -> PyResult<ColorSpace> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "gamma-luma" | "luma" => Ok(ColorSpace::GammaLuma),
        "lab" => Ok(ColorSpace::Lab),
        other => Err(invalid(format!(
            "Unknown color space '{other}'. Expected one of: gamma-luma, lab"
        ))),
    }
}

fn parse_pooling(name: &str) -> PyResult<Pooling> {
    match name.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "mean" => Ok(Pooling::Mean),
        "mad" | "mean-absolute-deviation" => Ok(Pooling::MeanAbsoluteDeviation),
        other => Err(invalid(format!(
            "Unknown pooling '{other}'. Expected one of: mean, mad"
        ))),
    }
}

impl Options<'_> {
    fn metric(&self) -> PyResult<Metric> {
        let Some(name) = self.metric else {
            return Ok(Metric::Ssim);
        };
        Metric::parse(name).ok_or_else(|| {
            invalid(format!(
                "Unknown metric '{name}'. Expected one of: {}",
                Metric::NAMES.join(", ")
            ))
        })
    }

    fn shared(&self) -> PyResult<SsimOptions> {
        let defaults = SsimOptions::default();
        let window_size = self.window_size.unwrap_or(defaults.window_size as u32);
        if window_size == 0 {
            return Err(invalid("window_size must be greater than 0"));
        }
        Ok(SsimOptions {
            window_size: window_size as usize,
            k1: self.k1.unwrap_or(defaults.k1),
            k2: self.k2.unwrap_or(defaults.k2),
            bit_depth: self.bit_depth.unwrap_or(defaults.bit_depth),
        })
    }

    fn weights(&self) -> PyResult<Vec<f64>> {
        match &self.weights {
            None => Ok(DEFAULT_WEIGHTS.to_vec()),
            Some(weights) if weights.is_empty() => Err(invalid("weights must not be empty")),
            Some(weights) => Ok(weights.clone()),
        }
    }

    fn ms_ssim(&self) -> PyResult<MsSsimOptions> {
        Ok(MsSsimOptions {
            weights: self.weights()?,
            method: match self.method {
                Some(name) => parse_method(name)?,
                None => MsSsimMethod::default(),
            },
        })
    }

    fn hitchhikers(&self) -> PyResult<HitchhikersOptions> {
        if self.window_stride == Some(0) {
            return Err(invalid("window_stride must be greater than 0"));
        }
        Ok(HitchhikersOptions {
            window_stride: self.window_stride.map(|stride| stride as usize),
            cov_pooling: self.cov_pooling.unwrap_or(true),
        })
    }

    fn perceptual(&self) -> PyResult<PerceptualOptions> {
        let defaults = PerceptualOptions::default();
        Ok(PerceptualOptions {
            weights: self.weights()?,
            method: match self.method {
                Some(name) => parse_method(name)?,
                None => defaults.method,
            },
            color: match self.color {
                Some(name) => parse_color_space(name)?,
                None => defaults.color,
            },
            chroma_weight: self.chroma_weight.unwrap_or(defaults.chroma_weight),
            chroma_subsample: self.chroma_subsample.unwrap_or(defaults.chroma_subsample),
            pooling: match self.pooling {
                Some(name) => parse_pooling(name)?,
                None => defaults.pooling,
            },
            deviation_weight: self.deviation_weight.unwrap_or(defaults.deviation_weight),
        })
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────

/// A pooled score and, on request, the map it came from.
#[pyclass(get_all, module = "blazediff_ssim")]
pub struct PySsimResult {
    /// Whether `score >= min_score`.
    pub match_result: bool,
    /// `None` on a match, otherwise "score-below-threshold".
    pub reason: Option<String>,
    pub metric: String,
    /// Pooled similarity. 1 means identical.
    pub score: f64,
    /// Map windows scoring below `min_score`.
    pub below_count: u32,
    /// Those windows as a percentage of the map.
    pub below_percentage: f64,
    /// Row-major local scores as little-endian `float32`, present only when
    /// `return_map` is set. `numpy.frombuffer(result.map, dtype="<f4")` wraps it
    /// without copying; `array.array("f")` + `frombytes` is the stdlib route.
    /// A list of Python floats would cost an object per window, which for a 4K
    /// pair is tens of millions of them.
    pub map: Option<Py<PyBytes>>,
    pub map_width: u32,
    pub map_height: u32,
}

#[pymethods]
impl PySsimResult {
    fn __repr__(&self) -> String {
        format!(
            "SsimResult(match_result={}, reason={}, metric='{}', score={}, below_count={}, below_percentage={}, map_width={}, map_height={})",
            if self.match_result { "True" } else { "False" },
            match &self.reason {
                Some(reason) => format!("'{}'", reason),
                None => "None".to_string(),
            },
            self.metric,
            self.score,
            self.below_count,
            self.below_percentage,
            self.map_width,
            self.map_height,
        )
    }
}

// ─── Running a metric ────────────────────────────────────────────────────────

/// Borrow an [`Image`]'s pixels in the shape the metrics take.
fn view(image: &Image) -> Rgba8<'_> {
    Rgba8::new(&image.data, image.width as usize, image.height as usize)
}

/// Map windows scoring below `floor`.
///
/// The floor is `min_score`, a policy of this binding rather than of the
/// metrics, which have no opinion about what counts as "different enough".
#[inline]
fn count_below(values: &[f32], floor: f32) -> u32 {
    values.iter().filter(|value| **value < floor).count() as u32
}

/// Little-endian `float32` bytes, spelled out rather than transmuted so the
/// wheel would still be correct on a big-endian target.
fn map_bytes<'py>(py: Python<'py>, map: &[f32]) -> Bound<'py, PyBytes> {
    let mut buffer = Vec::with_capacity(map.len() * 4);
    for value in map {
        buffer.extend_from_slice(&value.to_le_bytes());
    }
    PyBytes::new_bound(py, &buffer)
}

/// Read a `float32` map back out of the bytes `compare` handed over.
fn map_from_bytes(bytes: &[u8]) -> PyResult<Vec<f32>> {
    let values = bytes.chunks_exact(4);
    if !values.remainder().is_empty() {
        return Err(invalid(format!(
            "map is {} bytes, which is not a whole number of float32 values",
            bytes.len()
        )));
    }
    Ok(values
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

fn run(
    metric: Metric,
    image1: Rgba8<'_>,
    image2: Rgba8<'_>,
    options: &Options<'_>,
) -> PyResult<SsimOutcome> {
    let shared = options.shared()?;

    // Only perceptual_ssim sees colour; the rest reduce to luma first.
    if metric == Metric::PerceptualSsim {
        return Ok(perceptual_ssim(
            image1,
            image2,
            &shared,
            &options.perceptual()?,
        )?);
    }

    let plane1 = Plane::from_rgba8(image1)?;
    let plane2 = Plane::from_rgba8(image2)?;

    Ok(match metric {
        Metric::Ssim => ssim(&plane1, &plane2, &shared)?,
        Metric::MsSsim => ms_ssim(&plane1, &plane2, &shared, &options.ms_ssim()?)?,
        Metric::HitchhikersSsim => {
            hitchhikers_ssim(&plane1, &plane2, &shared, &options.hitchhikers()?)?
        }
        Metric::PerceptualSsim => unreachable!("handled above"),
    })
}

fn shape(
    py: Python<'_>,
    metric: Metric,
    outcome: SsimOutcome,
    options: &Options<'_>,
) -> PySsimResult {
    let min_score = options.min_score.unwrap_or(1.0);
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

    PySsimResult {
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
        map: options
            .return_map
            .unwrap_or(false)
            .then(|| map_bytes(py, &outcome.map).unbind()),
    }
}

/// Render the local map into `path`, at the size of the compared images.
fn write_map(
    path: &str,
    width: u32,
    height: u32,
    outcome: &SsimOutcome,
    options: &Options<'_>,
) -> PyResult<()> {
    let mut image = Image::new(width, height);
    render_map_into(
        &mut image.data,
        width as usize,
        height as usize,
        &outcome.map,
        outcome.map_width,
        outcome.map_height,
    );
    blazediff_shared::save_image(
        &image,
        path,
        options.compression.unwrap_or(0),
        options.quality.unwrap_or(90),
    )
    .map_err(|e| invalid(format!("Failed to save map: {e}")))
}

fn compare_images(
    py: Python<'_>,
    image1: Image,
    image2: Image,
    map_output: Option<&str>,
    options: &Options<'_>,
) -> PyResult<PySsimResult> {
    let metric = options.metric()?;
    let outcome = run(metric, view(&image1), view(&image2), options)?;

    if let Some(path) = map_output {
        write_map(path, image1.width, image1.height, &outcome, options)?;
    }

    Ok(shape(py, metric, outcome, options))
}

fn load(base_path: &str, compare_path: &str) -> PyResult<(Image, Image)> {
    blazediff_shared::load_image_pair(base_path, compare_path)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))
}

// ─── Exported functions ──────────────────────────────────────────────────────

/// Compare two image files, optionally rendering the local score map to a path.
///
/// `metric` is one of "ssim" (default), "ms-ssim", "hitchhikers-ssim" or
/// "perceptual-ssim". `min_score` (default 1) is the score at or above which the
/// images count as identical; `window_size` (11), `k1` (0.01), `k2` (0.03) and
/// `bit_depth` (8) tune every metric. `weights` and `method` apply to "ms-ssim"
/// and "perceptual-ssim"; `window_stride` and `cov_pooling` to
/// "hitchhikers-ssim"; `color`, `chroma_weight`, `chroma_subsample`, `pooling`
/// and `deviation_weight` to "perceptual-ssim". `compression` (0-9) and
/// `quality` (1-100) apply to a rendered `map_output`. Set `return_map` to carry
/// the local scores back on the result.
#[pyfunction]
#[pyo3(signature = (
    base_path,
    compare_path,
    map_output=None,
    *,
    metric=None,
    min_score=None,
    window_size=None,
    k1=None,
    k2=None,
    bit_depth=None,
    return_map=None,
    compression=None,
    quality=None,
    weights=None,
    method=None,
    window_stride=None,
    cov_pooling=None,
    color=None,
    chroma_weight=None,
    chroma_subsample=None,
    pooling=None,
    deviation_weight=None,
))]
#[allow(clippy::too_many_arguments)]
fn compare(
    py: Python<'_>,
    base_path: &str,
    compare_path: &str,
    map_output: Option<&str>,
    metric: Option<&str>,
    min_score: Option<f64>,
    window_size: Option<u32>,
    k1: Option<f64>,
    k2: Option<f64>,
    bit_depth: Option<u32>,
    return_map: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
    weights: Option<Vec<f64>>,
    method: Option<&str>,
    window_stride: Option<u32>,
    cov_pooling: Option<bool>,
    color: Option<&str>,
    chroma_weight: Option<f64>,
    chroma_subsample: Option<u32>,
    pooling: Option<&str>,
    deviation_weight: Option<f64>,
) -> PyResult<PySsimResult> {
    let options = Options {
        metric,
        min_score,
        window_size,
        k1,
        k2,
        bit_depth,
        return_map,
        compression,
        quality,
        weights,
        method,
        window_stride,
        cov_pooling,
        color,
        chroma_weight,
        chroma_subsample,
        pooling,
        deviation_weight,
    };
    let (image1, image2) = load(base_path, compare_path)?;
    compare_images(py, image1, image2, map_output, &options)
}

/// Compare two encoded images (PNG, JPEG or QOI) held in `bytes`.
///
/// Takes the same keyword arguments as `compare`.
#[pyfunction]
#[pyo3(signature = (
    base,
    comparison,
    map_output=None,
    *,
    metric=None,
    min_score=None,
    window_size=None,
    k1=None,
    k2=None,
    bit_depth=None,
    return_map=None,
    compression=None,
    quality=None,
    weights=None,
    method=None,
    window_stride=None,
    cov_pooling=None,
    color=None,
    chroma_weight=None,
    chroma_subsample=None,
    pooling=None,
    deviation_weight=None,
))]
#[allow(clippy::too_many_arguments)]
fn compare_buffers(
    py: Python<'_>,
    base: &[u8],
    comparison: &[u8],
    map_output: Option<&str>,
    metric: Option<&str>,
    min_score: Option<f64>,
    window_size: Option<u32>,
    k1: Option<f64>,
    k2: Option<f64>,
    bit_depth: Option<u32>,
    return_map: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
    weights: Option<Vec<f64>>,
    method: Option<&str>,
    window_stride: Option<u32>,
    cov_pooling: Option<bool>,
    color: Option<&str>,
    chroma_weight: Option<f64>,
    chroma_subsample: Option<u32>,
    pooling: Option<&str>,
    deviation_weight: Option<f64>,
) -> PyResult<PySsimResult> {
    let options = Options {
        metric,
        min_score,
        window_size,
        k1,
        k2,
        bit_depth,
        return_map,
        compression,
        quality,
        weights,
        method,
        window_stride,
        cov_pooling,
        color,
        chroma_weight,
        chroma_subsample,
        pooling,
        deviation_weight,
    };
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))?;
    compare_images(py, image1, image2, map_output, &options)
}

/// Compare two raw RGBA8 buffers — no decoding, the crate's native shape.
///
/// Takes the same keyword arguments as `compare`, minus `map_output` (there is
/// no image to size a rendered map against).
#[pyfunction]
#[pyo3(signature = (
    base,
    comparison,
    width,
    height,
    *,
    metric=None,
    min_score=None,
    window_size=None,
    k1=None,
    k2=None,
    bit_depth=None,
    return_map=None,
    weights=None,
    method=None,
    window_stride=None,
    cov_pooling=None,
    color=None,
    chroma_weight=None,
    chroma_subsample=None,
    pooling=None,
    deviation_weight=None,
))]
#[allow(clippy::too_many_arguments)]
fn compare_rgba(
    py: Python<'_>,
    base: &[u8],
    comparison: &[u8],
    width: u32,
    height: u32,
    metric: Option<&str>,
    min_score: Option<f64>,
    window_size: Option<u32>,
    k1: Option<f64>,
    k2: Option<f64>,
    bit_depth: Option<u32>,
    return_map: Option<bool>,
    weights: Option<Vec<f64>>,
    method: Option<&str>,
    window_stride: Option<u32>,
    cov_pooling: Option<bool>,
    color: Option<&str>,
    chroma_weight: Option<f64>,
    chroma_subsample: Option<u32>,
    pooling: Option<&str>,
    deviation_weight: Option<f64>,
) -> PyResult<PySsimResult> {
    let options = Options {
        metric,
        min_score,
        window_size,
        k1,
        k2,
        bit_depth,
        return_map,
        compression: None,
        quality: None,
        weights,
        method,
        window_stride,
        cov_pooling,
        color,
        chroma_weight,
        chroma_subsample,
        pooling,
        deviation_weight,
    };
    let metric = options.metric()?;
    let (width, height) = (width as usize, height as usize);
    let outcome = run(
        metric,
        Rgba8::new(base, width, height),
        Rgba8::new(comparison, width, height),
        &options,
    )?;
    Ok(shape(py, metric, outcome, &options))
}

/// Paint a local score map into a fresh RGBA8 buffer, dark where the score is
/// low. Nearest-neighbour stretched to `width` x `height`.
///
/// `map` is the little-endian `float32` blob a `return_map` comparison hands
/// back; the result is `width * height * 4` bytes.
#[pyfunction]
fn render_map<'py>(
    py: Python<'py>,
    map: &[u8],
    map_width: u32,
    map_height: u32,
    width: u32,
    height: u32,
) -> PyResult<Bound<'py, PyBytes>> {
    let map = map_from_bytes(map)?;
    let (width, height) = (width as usize, height as usize);
    let mut output = vec![0u8; width * height * 4];
    render_map_into(
        &mut output,
        width,
        height,
        &map,
        map_width as usize,
        map_height as usize,
    );
    Ok(PyBytes::new_bound(py, &output))
}

/// Every metric name this binding accepts, for feature detection.
#[pyfunction]
fn metrics() -> Vec<String> {
    Metric::NAMES.iter().map(|name| name.to_string()).collect()
}

#[pymodule]
fn blazediff_ssim(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compare, m)?)?;
    m.add_function(wrap_pyfunction!(compare_buffers, m)?)?;
    m.add_function(wrap_pyfunction!(compare_rgba, m)?)?;
    m.add_function(wrap_pyfunction!(render_map, m)?)?;
    m.add_function(wrap_pyfunction!(metrics, m)?)?;
    m.add_class::<PySsimResult>()?;
    Ok(())
}
