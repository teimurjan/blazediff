//! PyO3 bindings for Python integration.
//!
//! Mirrors `napi.rs` - exposes a path-based `compare()` and `interpret_images()`
//! to Python via maturin-built wheels.

use crate::{
    diff, interpret::html_report::generate_html_report, interpret::interpret as run_interpret_fn,
    interpret::types as itypes, load_jpeg, load_jpegs, load_png, load_pngs, save_jpeg,
    save_png_with_compression, DiffError, DiffOptions, Image,
};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
use rayon::prelude::*;
use std::path::Path;

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

// ─── Result types ────────────────────────────────────────────────────────────

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyBoundingBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyShapeStats {
    pub fill_ratio: f64,
    pub border_ratio: f64,
    pub inner_fill_ratio: f64,
    pub center_density: f64,
    pub row_occupancy: f64,
    pub col_occupancy: f64,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyColorDeltaStats {
    pub mean_delta: f64,
    pub max_delta: f64,
    pub delta_stddev: f64,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyGradientStats {
    pub edge_score: f64,
    pub edge_score_img2: f64,
    pub edge_correlation: f64,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyClassificationSignals {
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

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyChangeRegion {
    pub bbox: PyBoundingBox,
    pub pixel_count: u32,
    pub percentage: f64,
    pub position: String,
    pub shape: String,
    pub shape_stats: PyShapeStats,
    pub change_type: String,
    pub signals: PyClassificationSignals,
    pub confidence: f64,
    pub color_delta: PyColorDeltaStats,
    pub gradient: PyGradientStats,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyInterpretResult {
    pub summary: String,
    pub diff_count: u32,
    pub total_regions: u32,
    pub regions: Vec<PyChangeRegion>,
    pub severity: String,
    pub diff_percentage: f64,
    pub width: u32,
    pub height: u32,
}

#[pyclass(get_all, module = "blazediff")]
#[derive(Clone)]
pub struct PyDiffResult {
    pub match_result: bool,
    pub reason: Option<String>,
    pub diff_count: Option<u32>,
    pub diff_percentage: Option<f64>,
    pub interpretation: Option<PyInterpretResult>,
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

fn convert_region(r: &itypes::ChangeRegion) -> PyChangeRegion {
    PyChangeRegion {
        bbox: PyBoundingBox {
            x: r.bbox.x,
            y: r.bbox.y,
            width: r.bbox.width,
            height: r.bbox.height,
        },
        pixel_count: r.pixel_count,
        percentage: r.percentage,
        position: r.position.to_string(),
        shape: r.shape.to_string(),
        shape_stats: PyShapeStats {
            fill_ratio: r.shape_stats.fill_ratio,
            border_ratio: r.shape_stats.border_ratio,
            inner_fill_ratio: r.shape_stats.inner_fill_ratio,
            center_density: r.shape_stats.center_density,
            row_occupancy: r.shape_stats.row_occupancy,
            col_occupancy: r.shape_stats.col_occupancy,
        },
        change_type: r.change_type.to_string(),
        signals: PyClassificationSignals {
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
        color_delta: PyColorDeltaStats {
            mean_delta: r.color_delta.mean_delta as f64,
            max_delta: r.color_delta.max_delta as f64,
            delta_stddev: r.color_delta.delta_stddev as f64,
        },
        gradient: PyGradientStats {
            edge_score: r.gradient.edge_score as f64,
            edge_score_img2: r.gradient.edge_score_img2 as f64,
            edge_correlation: r.gradient.edge_correlation as f64,
        },
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
    interpret=None,
    output_format=None,
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
    interpret: Option<bool>,
    output_format: Option<&str>,
) -> PyResult<PyDiffResult> {
    let threshold = threshold.unwrap_or(0.1);
    let antialiasing = antialiasing.unwrap_or(false);
    let diff_mask = diff_mask.unwrap_or(false);
    let compression = compression.unwrap_or(0);
    let quality = quality.unwrap_or(90);
    let output_format = output_format.unwrap_or("png");
    let run_interpret = interpret.unwrap_or(false) || output_format == "html";

    let (img1, img2) = load_images(base_path, compare_path)
        .map_err(|e| PyValueError::new_err(format!("Failed to load images: {}", e)))?;

    if img1.width != img2.width || img1.height != img2.height {
        return Ok(PyDiffResult {
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

    if run_interpret {
        let result = run_interpret_fn(&img1, &img2, &diff_options)
            .map_err(|e| PyValueError::new_err(format!("Interpret failed: {}", e)))?;

        if output_format == "html" {
            if let Some(output_path) = diff_output {
                generate_html_report(&result, base_path, compare_path, output_path).map_err(
                    |e| PyValueError::new_err(format!("Failed to write HTML report: {}", e)),
                )?;
            }
        }

        let is_identical = result.total_regions == 0;
        let diff_count = result.diff_count;
        let diff_percentage = result.diff_percentage;
        let regions: Vec<PyChangeRegion> = result.regions.iter().map(convert_region).collect();

        return Ok(PyDiffResult {
            match_result: is_identical,
            reason: if is_identical {
                None
            } else {
                Some("pixel-diff".to_string())
            },
            diff_count: Some(diff_count),
            diff_percentage: Some(diff_percentage),
            interpretation: Some(PyInterpretResult {
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
            interpretation: None,
        })
    } else {
        Ok(PyDiffResult {
            match_result: false,
            reason: Some("pixel-diff".to_string()),
            diff_count: Some(result.diff_count),
            diff_percentage: Some(result.diff_percentage),
            interpretation: None,
        })
    }
}

/// Interpret the diff between two images, returning full structured results.
#[pyfunction]
#[pyo3(signature = (image1_path, image2_path, *, threshold=None, antialiasing=None))]
fn interpret_images(
    image1_path: &str,
    image2_path: &str,
    threshold: Option<f64>,
    antialiasing: Option<bool>,
) -> PyResult<PyInterpretResult> {
    let threshold = threshold.unwrap_or(0.1);
    let antialiasing = antialiasing.unwrap_or(false);

    let (img1, img2) = load_images(image1_path, image2_path)
        .map_err(|e| PyValueError::new_err(format!("Failed to load images: {}", e)))?;

    let diff_options = DiffOptions {
        threshold,
        include_aa: !antialiasing,
        ..Default::default()
    };

    let result = run_interpret_fn(&img1, &img2, &diff_options)
        .map_err(|e| PyValueError::new_err(format!("Interpret failed: {}", e)))?;

    Ok(PyInterpretResult {
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

#[pymodule]
fn blazediff(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compare, m)?)?;
    m.add_function(wrap_pyfunction!(interpret_images, m)?)?;
    m.add_class::<PyDiffResult>()?;
    m.add_class::<PyInterpretResult>()?;
    m.add_class::<PyChangeRegion>()?;
    m.add_class::<PyBoundingBox>()?;
    m.add_class::<PyShapeStats>()?;
    m.add_class::<PyColorDeltaStats>()?;
    m.add_class::<PyGradientStats>()?;
    m.add_class::<PyClassificationSignals>()?;
    Ok(())
}
