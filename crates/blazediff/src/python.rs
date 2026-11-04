//! PyO3 bindings for Python integration.
//!
//! Mirrors `napi.rs`: one `diff()` over file paths or encoded bytes, exposed
//! to Python via maturin-built wheels.

use crate::diff::diff_with;
use crate::{Background, DiffError, DiffOptions, DiffResult, Image, Metric, RenderOptions};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// A file path, or the bytes of an encoded PNG, JPEG or QOI file.
#[derive(FromPyObject)]
enum Input {
    #[pyo3(transparent, annotation = "str")]
    Path(String),
    #[pyo3(transparent, annotation = "bytes")]
    Encoded(Vec<u8>),
}

// ─── Result types ────────────────────────────────────────────────────────────

#[pyclass(get_all, frozen, module = "blazediff", name = "Size")]
#[derive(Clone)]
pub struct PySize {
    pub width: u32,
    pub height: u32,
}

#[pymethods]
impl PySize {
    fn __repr__(&self) -> String {
        format!("Size(width={}, height={})", self.width, self.height)
    }
}

/// Top-left corner and diff count of the busiest window.
#[pyclass(get_all, frozen, module = "blazediff", name = "WindowHit")]
#[derive(Clone)]
pub struct PyWindowHit {
    pub x: u32,
    pub y: u32,
    pub count: u32,
}

#[pymethods]
impl PyWindowHit {
    fn __repr__(&self) -> String {
        format!(
            "WindowHit(x={}, y={}, count={})",
            self.x, self.y, self.count
        )
    }
}

/// `kind` is "compared", "dimension-mismatch" or "io-error". Fields that do
/// not belong to the kind are None.
#[pyclass(get_all, frozen, module = "blazediff", name = "DiffResult")]
#[derive(Clone)]
pub struct PyDiffResult {
    pub kind: String,
    pub count: Option<u32>,
    pub percentage: Option<f64>,
    pub identical: Option<bool>,
    pub window: Option<PyWindowHit>,
    pub a: Option<PySize>,
    pub b: Option<PySize>,
    pub path: Option<String>,
    pub message: Option<String>,
}

impl PyDiffResult {
    fn empty(kind: &str) -> Self {
        Self {
            kind: kind.to_string(),
            count: None,
            percentage: None,
            identical: None,
            window: None,
            a: None,
            b: None,
            path: None,
            message: None,
        }
    }

    fn io_error(path: Option<String>, message: String) -> Self {
        Self {
            path,
            message: Some(message),
            ..Self::empty("io-error")
        }
    }

    fn from_result(result: DiffResult) -> Self {
        match result {
            DiffResult::Compared {
                count,
                percentage,
                identical,
                window,
            } => Self {
                count: Some(count),
                percentage: Some(percentage),
                identical: Some(identical),
                window: window.map(|hit| PyWindowHit {
                    x: hit.x,
                    y: hit.y,
                    count: hit.count,
                }),
                ..Self::empty("compared")
            },
            DiffResult::DimensionMismatch { a, b } => Self {
                a: Some(PySize {
                    width: a.width,
                    height: a.height,
                }),
                b: Some(PySize {
                    width: b.width,
                    height: b.height,
                }),
                ..Self::empty("dimension-mismatch")
            },
        }
    }
}

#[pymethods]
impl PyDiffResult {
    fn __repr__(&self) -> String {
        match self.kind.as_str() {
            "compared" => format!(
                "DiffResult(kind='compared', count={}, percentage={}, identical={}, window={})",
                self.count.unwrap_or(0),
                self.percentage.unwrap_or(0.0),
                if self.identical == Some(true) {
                    "True"
                } else {
                    "False"
                },
                self.window
                    .as_ref()
                    .map_or("None".to_string(), PyWindowHit::__repr__),
            ),
            "dimension-mismatch" => format!(
                "DiffResult(kind='dimension-mismatch', a={}, b={})",
                self.a.as_ref().map_or("None".to_string(), PySize::__repr__),
                self.b.as_ref().map_or("None".to_string(), PySize::__repr__),
            ),
            _ => format!(
                "DiffResult(kind='io-error', path={}, message={:?})",
                self.path
                    .as_ref()
                    .map_or("None".to_string(), |p| format!("'{}'", p)),
                self.message.as_deref().unwrap_or(""),
            ),
        }
    }
}

// ─── Public functions ────────────────────────────────────────────────────────

fn parse<T: std::str::FromStr<Err = String>>(value: Option<&str>) -> PyResult<Option<T>> {
    value
        .map(str::parse::<T>)
        .transpose()
        .map_err(PyValueError::new_err)
}

fn rgb(value: Option<Vec<u8>>, name: &str) -> PyResult<Option<[u8; 3]>> {
    value
        .map(|channels| {
            <[u8; 3]>::try_from(channels.as_slice()).map_err(|_| {
                PyValueError::new_err(format!(
                    "{}: expected 3 channels, got {}",
                    name,
                    channels.len()
                ))
            })
        })
        .transpose()
}

/// Loads both inputs; a failure becomes an `io-error` result.
fn load_pair(a: Input, b: Input) -> Result<(Image, Image), PyDiffResult> {
    let failed = |path: Option<&str>, e: DiffError| {
        PyDiffResult::io_error(
            path.map(str::to_string),
            format!("Failed to load images: {}", e),
        )
    };
    let load = |input: &Input| match input {
        Input::Path(path) => {
            blazediff_shared::load_image(path).map_err(|e| failed(Some(path), e.into()))
        }
        Input::Encoded(bytes) => {
            blazediff_shared::decode_image(bytes).map_err(|e| failed(None, e.into()))
        }
    };
    match (&a, &b) {
        (Input::Path(pa), Input::Path(pb)) => blazediff_shared::load_image_pair(pa, pb)
            .map_err(|e| failed(crate::failing_path([pa, pb]), e.into())),
        (Input::Encoded(ea), Input::Encoded(eb)) => {
            blazediff_shared::decode_image_pair(ea, eb).map_err(|e| failed(None, e.into()))
        }
        _ => Ok((load(&a)?, load(&b)?)),
    }
}

/// Compare two images (paths or encoded bytes) and optionally write a diff image.
#[pyfunction]
#[pyo3(signature = (
    a,
    b,
    output=None,
    *,
    threshold=0.1,
    antialiasing=true,
    metric=None,
    mask=None,
    window=None,
    alpha=0.1,
    diff_color=None,
    diff_color_alt=None,
    aa_color=None,
    background=None,
    compression=0,
    quality=90,
))]
#[allow(clippy::too_many_arguments)]
fn diff(
    a: Input,
    b: Input,
    output: Option<&str>,
    threshold: f64,
    antialiasing: bool,
    metric: Option<&str>,
    mask: Option<&[u8]>,
    window: Option<u32>,
    alpha: f64,
    diff_color: Option<Vec<u8>>,
    diff_color_alt: Option<Vec<u8>>,
    aa_color: Option<Vec<u8>>,
    background: Option<&str>,
    compression: u8,
    quality: u8,
) -> PyResult<PyDiffResult> {
    let defaults = RenderOptions::default();
    let options = DiffOptions {
        threshold,
        antialiasing,
        metric: parse::<Metric>(metric)?.unwrap_or_default(),
        mask: mask.map(<[u8]>::to_vec),
        window,
        render: RenderOptions {
            alpha,
            diff_color: rgb(diff_color, "diff_color")?.unwrap_or(defaults.diff_color),
            diff_color_alt: rgb(diff_color_alt, "diff_color_alt")?,
            aa_color: rgb(aa_color, "aa_color")?.unwrap_or(defaults.aa_color),
            background: parse::<Background>(background)?.unwrap_or_default(),
        },
    };

    let (img_a, img_b) = match load_pair(a, b) {
        Ok(pair) => pair,
        Err(failure) => return Ok(failure),
    };
    let same_size = img_a.width == img_b.width && img_a.height == img_b.height;
    let mut rendered = output
        .filter(|_| same_size)
        .map(|_| Image::new_uninit(img_a.width, img_a.height));
    let result = diff_with(&img_a, &img_b, rendered.as_mut(), &options, false)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;

    if let (Some(path), Some(image)) = (output, &rendered) {
        if !result.is_identical() {
            if let Err(e) = blazediff_shared::save_image(image, path, compression, quality) {
                return Ok(PyDiffResult::io_error(
                    Some(path.to_string()),
                    format!("Failed to save diff: {}", DiffError::from(e)),
                ));
            }
        }
    }
    Ok(PyDiffResult::from_result(result))
}

#[pymodule]
fn blazediff(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(diff, m)?)?;
    m.add_class::<PyDiffResult>()?;
    m.add_class::<PyWindowHit>()?;
    m.add_class::<PySize>()?;
    Ok(())
}
