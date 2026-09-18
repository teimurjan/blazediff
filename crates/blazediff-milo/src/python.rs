//! PyO3 bindings for the `blazediff-milo` wheel.
//!
//! Mirrors `napi.rs` one-for-one: the same four entry points, the same knobs
//! as keyword arguments, the same result shape. Decoding comes from
//! `blazediff-shared`, so paths and encoded buffers behave exactly as they do
//! in `@blazediff/milo-native`: PNG, JPEG and QOI, detected by extension for
//! paths and by magic bytes for buffers.

use crate::{milo, render_map as render_map_into, MiloError, MiloOptions, MiloOutcome, Rgba8};
use blazediff_shared::Image;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyBytes;

/// Every knob the `compare*` functions take, in one place.
struct Options {
    max_error: Option<f64>,
    threads: Option<u32>,
    return_maps: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
}

fn invalid(message: impl AsRef<str>) -> PyErr {
    PyValueError::new_err(message.as_ref().to_string())
}

/// Every way the metric can refuse is the caller handing it something it
/// cannot work with, so they all surface as `ValueError`, carrying the
/// crate's message verbatim.
impl From<MiloError> for PyErr {
    fn from(error: MiloError) -> Self {
        PyValueError::new_err(error.to_string())
    }
}

impl Options {
    fn milo(&self) -> MiloOptions {
        MiloOptions {
            threads: self.threads.map(|threads| threads as usize),
        }
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────

/// The verdict, the scores and, on request, the maps.
#[pyclass(get_all, module = "blazediff_milo")]
pub struct PyMiloResult {
    /// Whether `raw_error <= max_error`.
    pub match_result: bool,
    /// `None` on a match, otherwise "error-above-threshold".
    pub reason: Option<String>,
    /// Masked mean absolute error. Zero means identical.
    pub raw_error: f64,
    /// The raw error on KADID-10k's 1-5 mean-opinion-score scale. About 4.35
    /// for identical images, lower with damage.
    pub mos: f64,
    /// Row-major per-pixel visibility mask as little-endian `float32`,
    /// present only when `return_maps` is set.
    /// `numpy.frombuffer(result.mask, dtype="<f4")` wraps it without copying.
    pub mask: Option<Py<PyBytes>>,
    /// Row-major per-pixel perceived error in 0..1, same encoding as `mask`,
    /// present only when `return_maps` is set.
    pub error_map: Option<Py<PyBytes>>,
    pub width: u32,
    pub height: u32,
}

#[pymethods]
impl PyMiloResult {
    fn __repr__(&self) -> String {
        format!(
            "MiloResult(match_result={}, reason={}, raw_error={}, mos={}, width={}, height={})",
            if self.match_result { "True" } else { "False" },
            match &self.reason {
                Some(reason) => format!("'{}'", reason),
                None => "None".to_string(),
            },
            self.raw_error,
            self.mos,
            self.width,
            self.height,
        )
    }
}

// ─── Running the metric ──────────────────────────────────────────────────────

/// Borrow an [`Image`]'s pixels in the shape the metric takes.
fn view(image: &Image) -> Rgba8<'_> {
    Rgba8::new(&image.data, image.width as usize, image.height as usize)
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

fn shape(py: Python<'_>, outcome: MiloOutcome, options: &Options) -> PyMiloResult {
    let max_error = options.max_error.unwrap_or(0.0);
    let match_result = outcome.raw_error <= max_error;
    let return_maps = options.return_maps.unwrap_or(false);

    PyMiloResult {
        match_result,
        reason: if match_result {
            None
        } else {
            Some("error-above-threshold".to_string())
        },
        raw_error: outcome.raw_error,
        mos: outcome.mos,
        width: outcome.width as u32,
        height: outcome.height as u32,
        mask: return_maps.then(|| map_bytes(py, &outcome.mask).unbind()),
        error_map: return_maps.then(|| map_bytes(py, &outcome.error_map).unbind()),
    }
}

/// Render the error map into `path`, at the size of the compared images.
fn write_map(path: &str, outcome: &MiloOutcome, options: &Options) -> PyResult<()> {
    let mut image = Image::new(outcome.width as u32, outcome.height as u32);
    render_map_into(
        &mut image.data,
        outcome.width,
        outcome.height,
        &outcome.error_map,
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
    options: &Options,
) -> PyResult<PyMiloResult> {
    let outcome = milo(view(&image1), view(&image2), &options.milo())?;
    if let Some(path) = map_output {
        write_map(path, &outcome, options)?;
    }
    Ok(shape(py, outcome, options))
}

// ─── Exported functions ──────────────────────────────────────────────────────

/// Compare two image files, optionally rendering the error map to a path.
///
/// `max_error` (default 0) is the raw error at or below which the images
/// count as identical. `threads` (default: every core) spreads the work
/// without changing the result. `compression` (0-9) and `quality` (1-100)
/// apply to a rendered `map_output`. Set `return_maps` to carry the mask and
/// error map back on the result.
#[pyfunction]
#[pyo3(signature = (
    base_path,
    compare_path,
    map_output=None,
    *,
    max_error=None,
    threads=None,
    return_maps=None,
    compression=None,
    quality=None,
))]
fn compare(
    py: Python<'_>,
    base_path: &str,
    compare_path: &str,
    map_output: Option<&str>,
    max_error: Option<f64>,
    threads: Option<u32>,
    return_maps: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
) -> PyResult<PyMiloResult> {
    let options = Options {
        max_error,
        threads,
        return_maps,
        compression,
        quality,
    };
    let (image1, image2) = blazediff_shared::load_image_pair(base_path, compare_path)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))?;
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
    max_error=None,
    threads=None,
    return_maps=None,
    compression=None,
    quality=None,
))]
fn compare_buffers(
    py: Python<'_>,
    base: &[u8],
    comparison: &[u8],
    map_output: Option<&str>,
    max_error: Option<f64>,
    threads: Option<u32>,
    return_maps: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
) -> PyResult<PyMiloResult> {
    let options = Options {
        max_error,
        threads,
        return_maps,
        compression,
        quality,
    };
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))?;
    compare_images(py, image1, image2, map_output, &options)
}

/// Compare two raw RGBA8 buffers: no decoding, the crate's native shape.
///
/// Takes the same keyword arguments as `compare`, minus `map_output`.
#[pyfunction]
#[pyo3(signature = (
    base,
    comparison,
    width,
    height,
    *,
    max_error=None,
    threads=None,
    return_maps=None,
))]
fn compare_rgba(
    py: Python<'_>,
    base: &[u8],
    comparison: &[u8],
    width: u32,
    height: u32,
    max_error: Option<f64>,
    threads: Option<u32>,
    return_maps: Option<bool>,
) -> PyResult<PyMiloResult> {
    let options = Options {
        max_error,
        threads,
        return_maps,
        compression: None,
        quality: None,
    };
    let (width, height) = (width as usize, height as usize);
    let outcome = milo(
        Rgba8::new(base, width, height),
        Rgba8::new(comparison, width, height),
        &options.milo(),
    )?;
    Ok(shape(py, outcome, &options))
}

/// Paint a per-pixel map into a fresh RGBA8 buffer as grayscale, bright where
/// the value is high.
///
/// `map` is the little-endian `float32` blob a `return_maps` comparison hands
/// back, `width * height` values; the result is `width * height * 4` bytes.
#[pyfunction]
fn render_map<'py>(
    py: Python<'py>,
    map: &[u8],
    width: u32,
    height: u32,
) -> PyResult<Bound<'py, PyBytes>> {
    let map = map_from_bytes(map)?;
    let (width, height) = (width as usize, height as usize);
    let mut output = vec![0u8; width * height * 4];
    render_map_into(&mut output, width, height, &map);
    Ok(PyBytes::new_bound(py, &output))
}

#[pymodule]
fn blazediff_milo(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compare, m)?)?;
    m.add_function(wrap_pyfunction!(compare_buffers, m)?)?;
    m.add_function(wrap_pyfunction!(compare_rgba, m)?)?;
    m.add_function(wrap_pyfunction!(render_map, m)?)?;
    m.add_class::<PyMiloResult>()?;
    Ok(())
}
