//! N-API bindings for `@blazediff/milo-native`.
//!
//! Same shape as `blazediff-ssim`'s binding: paths, encoded buffers or raw
//! RGBA8 in; a match verdict, the two scores and, on request, the maps out.
//! Decoding comes from `blazediff-shared`, so paths and encoded buffers work
//! the same way they do in `@blazediff/core-native`: PNG, JPEG and QOI,
//! detected by extension for paths and by magic bytes for buffers.

use crate::{milo, render_map as render_map_into, MiloError, MiloOptions, MiloOutcome, Rgba8};
use blazediff_shared::Image;
use napi::bindgen_prelude::*;
use napi_derive::napi;

// ─── Options ─────────────────────────────────────────────────────────────────

/// Everything a comparison takes.
#[napi(object)]
pub struct NapiMiloOptions {
    /// Raw error at or below which the images count as identical. Default: 0,
    /// which only identical images satisfy.
    pub max_error: Option<f64>,
    /// Threads to spread the work over. Default: every core the OS reports.
    /// The result is the same whatever the count.
    pub threads: Option<u32>,
    /// Return the visibility mask and per-pixel error map alongside the
    /// scores. Default: false. They are one float per pixel each and cost a
    /// copy across the binding.
    pub return_maps: Option<bool>,
    /// PNG compression level (0-9) for a rendered error map. Default: 0.
    pub compression: Option<u8>,
    /// JPEG quality (1-100) for a rendered error map. Default: 90.
    pub quality: Option<u8>,
}

/// The verdict, the scores and, on request, the maps.
#[napi(object)]
pub struct NapiMiloResult {
    /// Whether `rawError <= maxError`.
    pub match_result: bool,
    /// `null` on a match, otherwise "error-above-threshold".
    pub reason: Option<String>,
    /// Masked mean absolute error. Zero means identical.
    pub raw_error: f64,
    /// The raw error on KADID-10k's 1-5 mean-opinion-score scale. About 4.35
    /// for identical images, lower with damage.
    pub mos: f64,
    /// Row-major per-pixel visibility mask; present only when `returnMaps` is set.
    pub mask: Option<Float32Array>,
    /// Row-major per-pixel perceived error in 0..1; present only when
    /// `returnMaps` is set.
    pub error_map: Option<Float32Array>,
    pub width: u32,
    pub height: u32,
}

// ─── Running the metric ──────────────────────────────────────────────────────

/// Every way the metric can refuse is the caller handing it something it
/// cannot work with, so they all surface as `InvalidArg`, carrying the
/// crate's message verbatim.
impl From<MiloError> for Error {
    fn from(error: MiloError) -> Self {
        Error::new(Status::InvalidArg, error.to_string())
    }
}

fn milo_options(options: &Option<NapiMiloOptions>) -> MiloOptions {
    MiloOptions {
        threads: options
            .as_ref()
            .and_then(|o| o.threads)
            .map(|threads| threads as usize),
    }
}

/// Borrow an [`Image`]'s pixels in the shape the metric takes.
fn view(image: &Image) -> Rgba8<'_> {
    Rgba8::new(&image.data, image.width as usize, image.height as usize)
}

fn shape(outcome: MiloOutcome, options: &Option<NapiMiloOptions>) -> NapiMiloResult {
    let max_error = options.as_ref().and_then(|o| o.max_error).unwrap_or(0.0);
    let match_result = outcome.raw_error <= max_error;
    let return_maps = options
        .as_ref()
        .and_then(|o| o.return_maps)
        .unwrap_or(false);

    NapiMiloResult {
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
        // Moved, not copied; callers who don't ask shouldn't pay to marshal them.
        mask: return_maps.then(|| Float32Array::new(outcome.mask)),
        error_map: return_maps.then(|| Float32Array::new(outcome.error_map)),
    }
}

/// Render the error map into `path`, at the size of the compared images.
fn write_map(path: &str, outcome: &MiloOutcome, options: &Option<NapiMiloOptions>) -> Result<()> {
    let mut image = Image::new(outcome.width as u32, outcome.height as u32);
    render_map_into(
        &mut image.data,
        outcome.width,
        outcome.height,
        &outcome.error_map,
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
    options: Option<NapiMiloOptions>,
) -> Result<NapiMiloResult> {
    let outcome = milo(view(&image1), view(&image2), &milo_options(&options))?;
    if let Some(path) = &map_output {
        write_map(path, &outcome, &options)?;
    }
    Ok(shape(outcome, &options))
}

// ─── Exported functions ──────────────────────────────────────────────────────

/// Compare two image files, optionally rendering the error map to a path.
#[napi]
pub fn compare(
    base_path: String,
    compare_path: String,
    map_output: Option<String>,
    options: Option<NapiMiloOptions>,
) -> Result<NapiMiloResult> {
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
    options: Option<NapiMiloOptions>,
) -> Result<NapiMiloResult> {
    let (image1, image2) = blazediff_shared::decode_image_pair(base, comparison).map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to load images: {e}"),
        )
    })?;
    compare_images(image1, image2, map_output, options)
}

/// Compare two raw RGBA8 buffers: no decoding, the crate's native shape.
#[napi]
pub fn compare_rgba(
    base: &[u8],
    comparison: &[u8],
    width: u32,
    height: u32,
    options: Option<NapiMiloOptions>,
) -> Result<NapiMiloResult> {
    let (width, height) = (width as usize, height as usize);
    let outcome = milo(
        Rgba8::new(base, width, height),
        Rgba8::new(comparison, width, height),
        &milo_options(&options),
    )?;
    Ok(shape(outcome, &options))
}

/// Paint a per-pixel map into a fresh RGBA8 buffer as grayscale, bright where
/// the value is high. `map` must hold `width * height` values.
#[napi]
pub fn render_map(map: Float32Array, width: u32, height: u32) -> Result<Buffer> {
    let (width, height) = (width as usize, height as usize);
    let mut output = vec![0u8; width * height * 4];
    render_map_into(&mut output, width, height, map.as_ref());
    Ok(output.into())
}
