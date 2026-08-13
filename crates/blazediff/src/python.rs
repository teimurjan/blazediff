//! PyO3 bindings for Python integration.
//!
//! Mirrors `napi.rs` - exposes a path-based `compare()`
//! to Python via maturin-built wheels.

use crate::{diff, DiffError, DiffOptions, Image};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use std::path::Path;

/// Load two images in parallel, auto-detecting format from their extensions.
fn load_images<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> std::result::Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::load_image_pair(path1, path2)?)
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

// ─── Result types ────────────────────────────────────────────────────────────

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyDiffResult {
    pub match_result: bool,
    pub reason: Option<String>,
    /// Differing pixels.
    pub diff_count: Option<u32>,
    pub diff_percentage: Option<f64>,
}

fn opt_str<T: std::fmt::Display>(v: &Option<T>) -> String {
    match v {
        Some(x) => x.to_string(),
        None => "None".to_string(),
    }
}

fn opt_quoted(v: &Option<String>) -> String {
    match v {
        Some(s) => format!("'{}'", s),
        None => "None".to_string(),
    }
}

#[pymethods]
impl PyDiffResult {
    fn __repr__(&self) -> String {
        format!(
            "DiffResult(match_result={}, reason={}, diff_count={}, diff_percentage={})",
            if self.match_result { "True" } else { "False" },
            opt_quoted(&self.reason),
            opt_str(&self.diff_count),
            opt_str(&self.diff_percentage),
        )
    }
}

// ─── Public functions ────────────────────────────────────────────────────────

/// Compare two images and optionally generate a diff image.
#[pyfunction]
#[pyo3(signature = (
    base_path,
    compare_path,
    diff_output=None,
    *,
    threshold=None,
    antialiasing=None,
    diff_mask=None,
    compression=None,
    quality=None,
))]
#[allow(clippy::too_many_arguments)]
fn compare(
    base_path: &str,
    compare_path: &str,
    diff_output: Option<&str>,
    threshold: Option<f64>,
    antialiasing: Option<bool>,
    diff_mask: Option<bool>,
    compression: Option<u8>,
    quality: Option<u8>,
) -> PyResult<PyDiffResult> {
    let threshold = threshold.unwrap_or(0.1);
    let antialiasing = antialiasing.unwrap_or(false);
    let diff_mask = diff_mask.unwrap_or(false);
    let compression = compression.unwrap_or(0);
    let quality = quality.unwrap_or(90);

    let (img1, img2) = load_images(base_path, compare_path)
        .map_err(|e| PyValueError::new_err(format!("Failed to load images: {}", e)))?;

    if img1.width != img2.width || img1.height != img2.height {
        return Ok(PyDiffResult {
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
        compression,
        ..Default::default()
    };
    let mut output_image = if diff_output.is_some() {
        Some(Image::new_uninit(img1.width, img1.height))
    } else {
        None
    };

    let result = diff(&img1, &img2, output_image.as_mut(), &diff_options)
        .map_err(|e| PyValueError::new_err(format!("Diff failed: {}", e)))?;

    if !result.identical {
        if let (Some(output_path), Some(ref output)) = (diff_output, &output_image) {
            save_image(output, output_path, compression, quality)
                .map_err(|e| PyValueError::new_err(format!("Failed to save diff: {}", e)))?;
        }
    }

    if result.identical {
        Ok(PyDiffResult {
            match_result: true,
            reason: None,
            diff_count: None,
            diff_percentage: None,
        })
    } else {
        Ok(PyDiffResult {
            match_result: false,
            reason: Some("pixel-diff".to_string()),
            diff_count: Some(result.diff_count),
            diff_percentage: Some(result.diff_percentage),
        })
    }
}

#[pymodule]
fn blazediff(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compare, m)?)?;
    m.add_class::<PyDiffResult>()?;
    Ok(())
}
