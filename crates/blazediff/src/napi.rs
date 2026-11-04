//! N-API bindings for Node.js integration
//!
//! Provides native bindings via napi-rs for direct function calls from JavaScript
//! without spawning child processes.

use crate::diff::diff_with;
use crate::{Background, DiffError, DiffOptions, DiffResult, Image, Metric, RenderOptions};
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Raw RGBA8 pixels.
#[napi(object)]
pub struct NapiImage {
    pub data: Uint8Array,
    pub width: u32,
    pub height: u32,
}

/// One input image: exactly one of `path`, `encoded` (PNG, JPEG or QOI bytes) or `image`.
#[napi(object)]
pub struct NapiInput {
    pub path: Option<String>,
    pub encoded: Option<Uint8Array>,
    pub image: Option<NapiImage>,
}

/// Where the diff goes: a file `path`, or an `image` buffer (RGBA8, width × height × 4)
/// filled in place. Neither is written when the images are identical.
#[napi(object)]
pub struct NapiOutput {
    pub path: Option<String>,
    /// PNG compression level (0-9, 0=fastest, 9=smallest). Default: 0
    pub compression: Option<u8>,
    /// JPEG quality (1-100). Default: 90
    pub quality: Option<u8>,
    pub image: Option<Uint8Array>,
}

#[napi(object)]
pub struct NapiRenderOptions {
    pub alpha: Option<f64>,
    pub diff_color: Option<Vec<u8>>,
    pub diff_color_alt: Option<Vec<u8>>,
    pub aa_color: Option<Vec<u8>>,
    /// "faded" (default) or "transparent"
    pub background: Option<String>,
}

#[napi(object)]
pub struct NapiDiffOptions {
    /// Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1
    pub threshold: Option<f64>,
    /// Detect anti-aliased pixels and leave them out of the count. Default: true
    pub antialiasing: Option<bool>,
    /// "yiq" (default) or "oklab" (pixelmatch 8)
    pub metric: Option<String>,
    /// One byte per pixel (width × height); non-zero pixels are skipped
    pub mask: Option<Uint8Array>,
    /// Also report the N×N window with the most diff pixels
    pub window: Option<u32>,
    pub render: Option<NapiRenderOptions>,
}

#[napi(object)]
pub struct NapiSize {
    pub width: u32,
    pub height: u32,
}

#[napi(object)]
pub struct NapiWindowHit {
    pub x: u32,
    pub y: u32,
    pub count: u32,
}

/// `kind` is "compared", "dimension-mismatch" or "io-error"; the other fields belong to one kind.
#[napi(object)]
pub struct NapiDiffResult {
    pub kind: String,
    pub count: Option<u32>,
    pub percentage: Option<f64>,
    pub identical: Option<bool>,
    pub window: Option<NapiWindowHit>,
    pub a: Option<NapiSize>,
    pub b: Option<NapiSize>,
    pub path: Option<String>,
    pub message: Option<String>,
}

impl NapiDiffResult {
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
                window: window.map(|hit| NapiWindowHit {
                    x: hit.x,
                    y: hit.y,
                    count: hit.count,
                }),
                ..Self::empty("compared")
            },
            DiffResult::DimensionMismatch { a, b } => Self {
                a: Some(NapiSize {
                    width: a.width,
                    height: a.height,
                }),
                b: Some(NapiSize {
                    width: b.width,
                    height: b.height,
                }),
                ..Self::empty("dimension-mismatch")
            },
        }
    }
}

fn invalid(message: impl Into<String>) -> Error {
    Error::new(Status::InvalidArg, message.into())
}

fn rgb(value: Option<Vec<u8>>, label: &str) -> Result<Option<[u8; 3]>> {
    let Some(value) = value else {
        return Ok(None);
    };
    match value.as_slice() {
        [r, g, b] => Ok(Some([*r, *g, *b])),
        _ => Err(invalid(format!(
            "{}: expected 3 channels, got {}",
            label,
            value.len()
        ))),
    }
}

fn parse<T: std::str::FromStr<Err = String>>(value: Option<String>) -> Result<Option<T>> {
    value
        .as_deref()
        .map(str::parse::<T>)
        .transpose()
        .map_err(invalid)
}

fn to_diff_options(options: Option<NapiDiffOptions>) -> Result<DiffOptions> {
    let defaults = DiffOptions::default();
    let Some(opts) = options else {
        return Ok(defaults);
    };
    let render = match opts.render {
        None => defaults.render,
        Some(render) => RenderOptions {
            alpha: render.alpha.unwrap_or(defaults.render.alpha),
            diff_color: rgb(render.diff_color, "diffColor")?.unwrap_or(defaults.render.diff_color),
            diff_color_alt: rgb(render.diff_color_alt, "diffColorAlt")?,
            aa_color: rgb(render.aa_color, "aaColor")?.unwrap_or(defaults.render.aa_color),
            background: parse::<Background>(render.background)?.unwrap_or_default(),
        },
    };
    Ok(DiffOptions {
        threshold: opts.threshold.unwrap_or(defaults.threshold),
        antialiasing: opts.antialiasing.unwrap_or(defaults.antialiasing),
        metric: parse::<Metric>(opts.metric)?.unwrap_or_default(),
        mask: opts.mask.map(|mask| mask.to_vec()),
        window: opts.window,
        render,
    })
}

enum Source {
    Path(String),
    Encoded(Uint8Array),
    Raw(Image),
}

fn to_source(input: NapiInput, label: &str) -> Result<Source> {
    match (input.path, input.encoded, input.image) {
        (Some(path), None, None) => Ok(Source::Path(path)),
        (None, Some(bytes), None) => Ok(Source::Encoded(bytes)),
        (None, None, Some(image)) => {
            let expected = image.width as usize * image.height as usize * 4;
            if image.data.len() != expected {
                return Err(invalid(format!(
                    "{}.data is {} bytes, expected {} for {}x{}.",
                    label,
                    image.data.len(),
                    expected,
                    image.width,
                    image.height
                )));
            }
            Ok(Source::Raw(Image {
                width: image.width,
                height: image.height,
                data: image.data.to_vec(),
            }))
        }
        _ => Err(invalid(format!(
            "{}: expected exactly one of path, encoded or image",
            label
        ))),
    }
}

/// Loads one side. Errors carry the path when there is one.
fn load(source: Source) -> std::result::Result<Image, (Option<String>, DiffError)> {
    match source {
        Source::Path(path) => {
            blazediff_shared::load_image(&path).map_err(|e| (Some(path), DiffError::from(e)))
        }
        Source::Encoded(bytes) => {
            blazediff_shared::decode_image(&bytes).map_err(|e| (None, DiffError::from(e)))
        }
        Source::Raw(image) => Ok(image),
    }
}

/// Loads both sides, decoding two paths or two byte arrays in parallel.
fn load_pair(a: Source, b: Source) -> std::result::Result<(Image, Image), NapiDiffResult> {
    let failed =
        |(path, e): (Option<String>, DiffError)| NapiDiffResult::io_error(path, e.to_string());
    match (a, b) {
        (Source::Path(a), Source::Path(b)) => {
            blazediff_shared::load_image_pair(&a, &b).map_err(|e| {
                let path = crate::failing_path([&a, &b]).map(str::to_string);
                failed((path, DiffError::from(e)))
            })
        }
        (Source::Encoded(a), Source::Encoded(b)) => {
            blazediff_shared::decode_image_pair(&a, &b).map_err(|e| failed((None, e.into())))
        }
        (a, b) => Ok((load(a).map_err(failed)?, load(b).map_err(failed)?)),
    }
}

/// Compares two images. Bad options throw; unreadable inputs return `kind: "io-error"`.
#[napi]
pub fn diff(
    a: NapiInput,
    b: NapiInput,
    output: Option<NapiOutput>,
    options: Option<NapiDiffOptions>,
) -> Result<NapiDiffResult> {
    let options = to_diff_options(options)?;
    let (a, b) = (to_source(a, "a")?, to_source(b, "b")?);
    let output = output.unwrap_or(NapiOutput {
        path: None,
        compression: None,
        quality: None,
        image: None,
    });
    if output.path.is_some() && output.image.is_some() {
        return Err(invalid("output: expected one of path or image"));
    }

    let (img_a, img_b) = match load_pair(a, b) {
        Ok(pair) => pair,
        Err(failure) => return Ok(failure),
    };
    if img_a.width != img_b.width || img_a.height != img_b.height {
        return Ok(NapiDiffResult::from_result(
            diff_with(&img_a, &img_b, None, &options, false).map_err(generic)?,
        ));
    }

    let wants_output = output.path.is_some() || output.image.is_some();
    let mut rendered = wants_output.then(|| Image::new_uninit(img_a.width, img_a.height));
    // An image output is kept even when identical, so it needs the full render.
    let fill_identical = output.image.is_some();
    let result =
        diff_with(&img_a, &img_b, rendered.as_mut(), &options, fill_identical).map_err(generic)?;

    if let (Some(mut target), Some(image)) = (output.image, &rendered) {
        if target.len() != image.data.len() {
            return Err(invalid(format!(
                "output.image is {} bytes, expected {}.",
                target.len(),
                image.data.len()
            )));
        }
        target.copy_from_slice(&image.data);
    }
    if let (Some(path), Some(image)) = (&output.path, &rendered) {
        if !result.is_identical() {
            let saved = blazediff_shared::save_image(
                image,
                path,
                output.compression.unwrap_or(0),
                output.quality.unwrap_or(90),
            );
            if let Err(e) = saved {
                return Ok(NapiDiffResult::io_error(
                    Some(path.clone()),
                    format!("Failed to save diff: {}", DiffError::from(e)),
                ));
            }
        }
    }
    Ok(NapiDiffResult::from_result(result))
}

fn generic(e: DiffError) -> Error {
    match e {
        DiffError::InvalidMaskSize { .. } | DiffError::InvalidDataSize { .. } => {
            invalid(e.to_string())
        }
        other => Error::new(Status::GenericFailure, format!("Diff failed: {}", other)),
    }
}
