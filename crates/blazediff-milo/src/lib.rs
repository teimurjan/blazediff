//! MILO: a learned perceptual image quality metric, run on the CPU.
//!
//! MILO (Çoğalan, Bemana, Myszkowski, Seidel and Groth, ACM TOG 2025) is a
//! full-reference metric that models *visual masking*: an error hidden in
//! texture counts for less than the same error on a flat surface. Where SSIM
//! is a formula, MILO is a small convolutional network, 44,930 parameters,
//! whose trained weights ship inside this crate. Given a reference and a
//! distorted image it predicts a per-pixel visibility mask, weights the
//! absolute error by it, and pools that into one number.
//!
//! This is a port of the authors' PyTorch implementation, held to its outputs
//! by `tests/parity.rs`. Same pyramid, same network, same pooling; only the
//! execution differs: a line-buffer pipeline so memory stays flat whatever
//! the image size, lane-generic SIMD kernels picked at compile time, and row
//! bands spread over threads with results that don't depend on the thread
//! count.
//!
//! ```
//! use blazediff_milo::{milo, MiloOptions, Rgba8};
//!
//! # fn main() -> Result<(), blazediff_milo::MiloError> {
//! # let (width, height) = (64, 64);
//! # let (rgba1, rgba2) = (vec![0u8; width * height * 4], vec![0u8; width * height * 4]);
//! let outcome = milo(
//!     Rgba8::new(&rgba1, width, height),
//!     Rgba8::new(&rgba2, width, height),
//!     &MiloOptions::default(),
//! )?;
//! println!("raw error {:.6}, MOS {:.3}", outcome.raw_error, outcome.mos);
//! # Ok(())
//! # }
//! ```
//!
//! Two numbers come out. `raw_error` is the metric proper: the masked mean
//! absolute error, exactly zero for identical images and growing with visible
//! damage (the fixtures in this repo land between 0.0002 and 0.01). `mos` maps
//! it onto KADID-10k's five-point mean opinion score through a learned
//! calibration; note the calibration tops out around 4.35 rather than 5 for
//! identical input, so threshold on `raw_error`, not `mos`.

mod conv;
mod error;
mod map;
mod metric;
#[cfg(feature = "napi")]
mod napi;
mod network;
mod pyramid;
#[cfg(feature = "python")]
mod python;
mod simd;
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
mod wasm;
mod weights;

pub use error::MiloError;
pub use map::render_map;

/// The smallest side the reference implementation accepts: three halvings
/// must leave at least two pixels for the seed mask.
pub const MIN_SIDE: usize = 16;

/// A borrowed RGBA8 image, 4 bytes per pixel, row-major. Alpha is ignored,
/// as the reference converts to RGB.
#[derive(Clone, Copy, Debug)]
pub struct Rgba8<'a> {
    pub data: &'a [u8],
    pub width: usize,
    pub height: usize,
}

impl<'a> Rgba8<'a> {
    pub fn new(data: &'a [u8], width: usize, height: usize) -> Self {
        Self {
            data,
            width,
            height,
        }
    }

    /// Reject a buffer that cannot hold `width * height` RGBA pixels.
    fn validate(&self) -> Result<(), MiloError> {
        let pixels = self.width * self.height;
        if self.data.len() < pixels * 4 {
            return Err(MiloError::Options(format!(
                "image data is {} bytes, need {} for {}x{} RGBA",
                self.data.len(),
                pixels * 4,
                self.width,
                self.height
            )));
        }
        Ok(())
    }

    /// Reject a pair the metric would otherwise index out of bounds or the
    /// reference would refuse.
    fn validate_pair(&self, other: Rgba8<'_>) -> Result<(), MiloError> {
        if self.width != other.width || self.height != other.height {
            return Err(MiloError::SizeMismatch {
                img1_width: self.width as u32,
                img1_height: self.height as u32,
                img2_width: other.width as u32,
                img2_height: other.height as u32,
            });
        }
        if self.width < MIN_SIDE || self.height < MIN_SIDE {
            return Err(MiloError::InputTooSmall {
                width: self.width as u32,
                height: self.height as u32,
                minimum: MIN_SIDE as u32,
            });
        }
        self.validate()?;
        other.validate()
    }
}

/// Knobs for a comparison.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MiloOptions {
    /// Threads to spread row bands over. `None` uses every core the OS
    /// reports; `Some(1)` runs inline. The result is bit-identical either way.
    /// Ignored on wasm32, which has no threads.
    pub threads: Option<usize>,
}

/// A score and the maps it was pooled from.
#[derive(Clone, Debug)]
pub struct MiloOutcome {
    /// Mean over pixels and channels of `mask * |reference - distorted|`.
    /// Zero for identical images. This is the metric.
    pub raw_error: f64,
    /// `raw_error` on KADID-10k's 1..5 mean-opinion-score scale, via the
    /// learned scaler. About 4.35 for identical images, lower with damage.
    pub mos: f64,
    /// The visibility mask, one value per pixel, row-major. Each pyramid
    /// level adds a sigmoid in `(0, 1)`, so the range is `(0, 4)`.
    pub mask: Vec<f32>,
    /// Per-pixel perceived error, row-major, in `0..1`: the scaler applied to
    /// each pixel's masked error, minus its value at zero. The reference's
    /// `MILO_map`.
    pub error_map: Vec<f32>,
    pub width: usize,
    pub height: usize,
}

/// Compare `distorted` against `reference`.
///
/// Both must be the same size, at least [`MIN_SIDE`] on each side.
pub fn milo(
    reference: Rgba8<'_>,
    distorted: Rgba8<'_>,
    options: &MiloOptions,
) -> Result<MiloOutcome, MiloError> {
    metric::run(reference, distorted, options)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgba(width: usize, height: usize, value: u8) -> Vec<u8> {
        let mut data = vec![0u8; width * height * 4];
        for pixel in data.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[value, value, value, 255]);
        }
        data
    }

    #[test]
    fn identical_images_score_zero() {
        let data = rgba(20, 17, 128);
        let outcome = milo(
            Rgba8::new(&data, 20, 17),
            Rgba8::new(&data, 20, 17),
            &MiloOptions::default(),
        )
        .unwrap();
        assert_eq!(outcome.raw_error, 0.0);
        assert!(outcome.error_map.iter().all(|v| *v == 0.0));
        assert_eq!(outcome.mask.len(), 20 * 17);
        assert!((outcome.mos - 4.346).abs() < 0.01);
    }

    #[test]
    fn a_visible_change_scores_above_zero() {
        let a = rgba(32, 32, 30);
        let mut b = a.clone();
        for pixel in b.chunks_exact_mut(4).skip(300).take(200) {
            pixel[..3].copy_from_slice(&[220, 220, 220]);
        }
        let outcome = milo(
            Rgba8::new(&a, 32, 32),
            Rgba8::new(&b, 32, 32),
            &MiloOptions::default(),
        )
        .unwrap();
        assert!(outcome.raw_error > 0.0);
        assert!(outcome.mos < 4.3);
        assert!(outcome.error_map.iter().any(|v| *v > 0.0));
    }

    #[test]
    fn the_thread_count_does_not_change_the_answer() {
        let a = rgba(40, 70, 90);
        let mut b = a.clone();
        for (i, pixel) in b.chunks_exact_mut(4).enumerate() {
            pixel[0] = ((i * 31) % 255) as u8;
        }
        let one = milo(
            Rgba8::new(&a, 40, 70),
            Rgba8::new(&b, 40, 70),
            &MiloOptions { threads: Some(1) },
        )
        .unwrap();
        let four = milo(
            Rgba8::new(&a, 40, 70),
            Rgba8::new(&b, 40, 70),
            &MiloOptions { threads: Some(4) },
        )
        .unwrap();
        assert_eq!(one.raw_error, four.raw_error);
        assert_eq!(one.mask, four.mask);
        assert_eq!(one.error_map, four.error_map);
    }

    #[test]
    fn alpha_is_ignored() {
        let a = rgba(16, 16, 100);
        let mut b = a.clone();
        for pixel in b.chunks_exact_mut(4) {
            pixel[3] = 0;
        }
        let outcome = milo(
            Rgba8::new(&a, 16, 16),
            Rgba8::new(&b, 16, 16),
            &MiloOptions::default(),
        )
        .unwrap();
        assert_eq!(outcome.raw_error, 0.0);
    }

    #[test]
    fn mismatched_sizes_are_rejected() {
        let a = rgba(16, 16, 0);
        let b = rgba(16, 17, 0);
        assert!(matches!(
            milo(
                Rgba8::new(&a, 16, 16),
                Rgba8::new(&b, 16, 17),
                &MiloOptions::default()
            ),
            Err(MiloError::SizeMismatch { .. })
        ));
    }

    #[test]
    fn inputs_below_the_reference_floor_are_rejected() {
        let a = rgba(15, 40, 0);
        assert!(matches!(
            milo(
                Rgba8::new(&a, 15, 40),
                Rgba8::new(&a, 15, 40),
                &MiloOptions::default()
            ),
            Err(MiloError::InputTooSmall { minimum: 16, .. })
        ));
    }

    #[test]
    fn a_short_buffer_is_rejected() {
        let a = rgba(16, 16, 0);
        assert!(matches!(
            milo(
                Rgba8::new(&a, 32, 16),
                Rgba8::new(&a, 32, 16),
                &MiloOptions::default()
            ),
            Err(MiloError::Options(_))
        ));
    }
}
