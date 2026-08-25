//! PyO3 bindings for the `blazediff-interpret` wheel.
//!
//! Mirrors `napi.rs`: this crate sits above both producers, so the binding can
//! run either of them and interpret the result — a pixel diff for exact regions,
//! a similarity metric for a coarse map — and both come out as the same
//! `InterpretResult`, handed over as a plain dict.

use crate::{interpret, interpret_diff, BoundingBox, ChangeSource};
use blazediff::DiffOptions;
use blazediff_shared::Image;
use blazediff_ssim::{
    hitchhikers_ssim, ms_ssim, ssim, HitchhikersOptions, MsSsimOptions, Plane, Rgba8, SsimOptions,
};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use pyo3::types::PyMapping;

/// Score at or below which a map window counts as changed when locating
/// regions with a similarity metric.
const DEFAULT_REGION_FLOOR: f64 = 0.99;

fn invalid(message: impl AsRef<str>) -> PyErr {
    PyValueError::new_err(message.as_ref().to_string())
}

impl From<crate::InterpretError> for PyErr {
    fn from(error: crate::InterpretError) -> Self {
        PyValueError::new_err(error.to_string())
    }
}

/// The knobs for the diff-driven path.
///
/// `antialiasing` is the inverse of the core's `include_aa`, matching
/// `@blazediff/interpret-native` and `blazediff.compare`.
fn diff_options(
    threshold: Option<f64>,
    antialiasing: Option<bool>,
    compression: Option<u8>,
) -> DiffOptions {
    let defaults = DiffOptions::default();
    DiffOptions {
        threshold: threshold.unwrap_or(defaults.threshold),
        include_aa: !antialiasing.unwrap_or(false),
        compression: compression.unwrap_or(defaults.compression),
        ..defaults
    }
}

fn load(base_path: &str, compare_path: &str) -> PyResult<(Image, Image)> {
    blazediff_shared::load_image_pair(base_path, compare_path)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))
}

/// `InterpretResult` already derives `Serialize`, so the whole nested shape
/// crosses as a dict without a second set of `#[pyclass]` declarations. Keys
/// stay camelCase, matching the N-API result and the CLI's `--json`.
fn to_dict(py: Python<'_>, result: crate::InterpretResult) -> PyResult<PyObject> {
    pythonize::pythonize(py, &result)
        .map(|value| value.unbind())
        .map_err(|e| invalid(format!("Failed to serialize: {e}")))
}

/// A caller-supplied region: `(x, y, width, height)`, or any mapping carrying
/// those four keys — which is the shape a prior result's `bbox` comes back in,
/// so regions round-trip without being rewritten.
fn bounding_box(region: &Bound<'_, PyAny>) -> PyResult<BoundingBox> {
    if let Ok(mapping) = region.downcast::<PyMapping>() {
        let field = |name: &str| -> PyResult<u32> {
            mapping
                .get_item(name)
                .map_err(|_| invalid(format!("region is missing '{name}'")))?
                .extract()
        };
        return Ok(BoundingBox {
            x: field("x")?,
            y: field("y")?,
            width: field("width")?,
            height: field("height")?,
        });
    }
    let (x, y, width, height) = region.extract().map_err(|_| {
        invalid("region must be an (x, y, width, height) tuple or a mapping with those keys")
    })?;
    Ok(BoundingBox {
        x,
        y,
        width,
        height,
    })
}

/// Interpret the pixel diff between two images, optionally writing the
/// visualization to `diff_output`.
#[pyfunction]
#[pyo3(signature = (
    base_path,
    compare_path,
    diff_output=None,
    *,
    threshold=None,
    antialiasing=None,
    compression=None,
    quality=None,
))]
#[allow(clippy::too_many_arguments)]
fn interpret_images(
    py: Python<'_>,
    base_path: &str,
    compare_path: &str,
    diff_output: Option<&str>,
    threshold: Option<f64>,
    antialiasing: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
) -> PyResult<PyObject> {
    let (image1, image2) = load(base_path, compare_path)?;
    let options = diff_options(threshold, antialiasing, compression);

    let mut output = diff_output.map(|_| Image::new_uninit(image1.width, image1.height));
    let result = interpret_diff(&image1, &image2, output.as_mut(), &options)?;

    if let (Some(path), Some(image)) = (diff_output, &output) {
        if result.diff_count > 0 {
            blazediff_shared::save_image(image, path, options.compression, quality.unwrap_or(90))
                .map_err(|e| invalid(format!("Failed to save diff: {e}")))?;
        }
    }

    to_dict(py, result)
}

/// Interpret two encoded images (PNG, JPEG or QOI) held in `bytes`.
#[pyfunction]
#[pyo3(signature = (
    base,
    comparison,
    *,
    threshold=None,
    antialiasing=None,
    compression=None,
))]
fn interpret_buffers(
    py: Python<'_>,
    base: &[u8],
    comparison: &[u8],
    threshold: Option<f64>,
    antialiasing: Option<bool>,
    compression: Option<u8>,
) -> PyResult<PyObject> {
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison)
        .map_err(|e| invalid(format!("Failed to load images: {e}")))?;
    let result = interpret_diff(
        &image1,
        &image2,
        None,
        &diff_options(threshold, antialiasing, compression),
    )?;
    to_dict(py, result)
}

/// Interpret two images, locating the regions with a similarity metric instead
/// of a pixel diff.
///
/// The map's grid is coarse, so the boxes are blocky; the statistics are not,
/// because each box is refined against the source pixels before it is measured.
#[pyfunction]
#[pyo3(signature = (base_path, compare_path, *, metric=None, window_size=None, region_floor=None))]
fn interpret_ssim(
    py: Python<'_>,
    base_path: &str,
    compare_path: &str,
    metric: Option<&str>,
    window_size: Option<u32>,
    region_floor: Option<f64>,
) -> PyResult<PyObject> {
    let (image1, image2) = load(base_path, compare_path)?;

    let mut shared = SsimOptions::default();
    if let Some(size) = window_size {
        if size == 0 {
            return Err(invalid("window_size must be greater than 0"));
        }
        shared.window_size = size as usize;
    }

    let plane = |image: &Image| {
        Plane::from_rgba8(Rgba8::new(
            &image.data,
            image.width as usize,
            image.height as usize,
        ))
        .map_err(|e| invalid(e.to_string()))
    };
    let (plane1, plane2) = (plane(&image1)?, plane(&image2)?);

    let metric = metric
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
            return Err(invalid(format!(
                "Unknown metric '{other}'. Expected one of: ssim, ms-ssim, hitchhikers-ssim"
            )))
        }
    }
    .map_err(|e| invalid(e.to_string()))?;

    let result = interpret(
        &image1,
        &image2,
        ChangeSource::Ssim {
            outcome: &outcome,
            floor: region_floor.unwrap_or(DEFAULT_REGION_FLOOR) as f32,
        },
    )?;
    to_dict(py, result)
}

/// Interpret regions the caller already knows about.
#[pyfunction]
fn interpret_regions(
    py: Python<'_>,
    base_path: &str,
    compare_path: &str,
    regions: Vec<Bound<'_, PyAny>>,
) -> PyResult<PyObject> {
    let (image1, image2) = load(base_path, compare_path)?;
    let boxes = regions
        .iter()
        .map(bounding_box)
        .collect::<PyResult<Vec<_>>>()?;
    let result = interpret(&image1, &image2, ChangeSource::Regions(&boxes))?;
    to_dict(py, result)
}

#[pymodule]
fn blazediff_interpret(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(interpret_images, m)?)?;
    m.add_function(wrap_pyfunction!(interpret_buffers, m)?)?;
    m.add_function(wrap_pyfunction!(interpret_ssim, m)?)?;
    m.add_function(wrap_pyfunction!(interpret_regions, m)?)?;
    Ok(())
}
