//! Structural-similarity metrics: SSIM, MS-SSIM and Hitchhiker's SSIM.
//!
//! Where a pixel diff answers "which pixels changed", these answer "how alike
//! do these look": a single score in `0..=1` that tolerates imperceptible noise
//! and punishes structural damage. They are ports of `@blazediff/ssim`, which
//! is validated against the reference MATLAB scripts in `packages/ssim/matlab`;
//! `tests/matlab_parity.rs` holds the Rust side of that proof to the same
//! tolerances.
//!
//! The hot loops are vectorised through `simd`, which picks a lane backend at
//! compile time. Tap-by-tap accumulation order is kept identical to the JS
//! reference so the ports inherit its measured MATLAB agreement rather than
//! drifting by an unmeasured amount.
//!
//! ```
//! use blazediff_ssim::{ms_ssim, MsSsimOptions, Plane, Rgba8, SsimOptions};
//!
//! # fn main() -> Result<(), blazediff_ssim::SsimError> {
//! # let (width, height) = (256, 256);
//! # let (rgba1, rgba2) = (vec![0u8; width * height * 4], vec![0u8; width * height * 4]);
//! let plane1 = Plane::from_rgba8(Rgba8::new(&rgba1, width, height))?;
//! let plane2 = Plane::from_rgba8(Rgba8::new(&rgba2, width, height))?;
//!
//! let outcome = ms_ssim(
//!     &plane1,
//!     &plane2,
//!     &SsimOptions::default(),
//!     &MsSsimOptions::default(),
//! )?;
//! println!("{:.6}", outcome.score);
//! # Ok(())
//! # }
//! ```

mod color;
mod convolve;
mod error;
mod gaussian;
mod grayscale;
mod hitchhikers;
mod map;
mod multiscale;
#[cfg(feature = "napi")]
mod napi;
mod perceptual;
mod simd;
mod standard;
mod stats;

pub use error::SsimError;
pub use hitchhikers::{hitchhikers_ssim, HitchhikersOptions};
pub use map::render_map;
pub use multiscale::{ms_ssim, MsSsimMethod, MsSsimOptions, DEFAULT_WEIGHTS};
pub use perceptual::{perceptual_ssim, ColorSpace, PerceptualOptions, Pooling};
pub use standard::ssim;

/// A borrowed RGBA8 image, 4 bytes per pixel, row-major.
///
/// The metrics never need to own their input, so this is what they take:
/// `Copy`, four words wide, and cheap to build over whatever buffer the caller
/// already has.
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
    fn validate(&self) -> Result<usize, SsimError> {
        let pixels = self.width * self.height;
        if self.data.len() < pixels * 4 {
            return Err(SsimError::Options(format!(
                "image data is {} bytes, need {} for {}x{} RGBA",
                self.data.len(),
                pixels * 4,
                self.width,
                self.height
            )));
        }
        Ok(pixels)
    }
}

/// A single-channel luma plane, the form every metric works in.
#[derive(Clone, Debug)]
pub struct Plane {
    pub samples: Vec<f32>,
    pub width: usize,
    pub height: usize,
}

impl Plane {
    /// Reduce an RGBA image to luma using MATLAB's `rgb2gray` weights.
    pub fn from_rgba8(image: Rgba8<'_>) -> Result<Self, SsimError> {
        let pixels = image.validate()?;
        Ok(Self {
            samples: grayscale::to_luma(&image.data[..pixels * 4]),
            width: image.width,
            height: image.height,
        })
    }

    /// Reject a pair the metrics would otherwise index out of bounds.
    ///
    /// Every metric reads `image2` with `image1`'s dimensions, so a mismatch is
    /// a panic rather than a wrong answer. This is the guard that turns it into
    /// an error at the crate boundary.
    fn validate_pair(image1: &Plane, image2: &Plane) -> Result<(), SsimError> {
        if image1.width != image2.width || image1.height != image2.height {
            return Err(SsimError::SizeMismatch {
                img1_width: image1.width as u32,
                img1_height: image1.height as u32,
                img2_width: image2.width as u32,
                img2_height: image2.height as u32,
            });
        }
        let expected = image1.width * image1.height;
        if image1.samples.len() < expected || image2.samples.len() < expected {
            return Err(SsimError::Options(format!(
                "plane samples are shorter than {}x{}",
                image1.width, image1.height
            )));
        }
        Ok(())
    }
}

/// Knobs shared by every SSIM variant.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SsimOptions {
    /// Side of the local window. Default 11, as in every reference.
    pub window_size: usize,
    /// Luminance stability constant: `c1 = (k1·L)²`. Default 0.01.
    pub k1: f64,
    /// Contrast stability constant: `c2 = (k2·L)²`. Default 0.03.
    pub k2: f64,
    /// Sample bit depth, which sets the dynamic range `L = 2^bit_depth - 1`.
    /// Default 8.
    pub bit_depth: u32,
}

impl Default for SsimOptions {
    fn default() -> Self {
        Self {
            window_size: 11,
            k1: 0.01,
            k2: 0.03,
            bit_depth: 8,
        }
    }
}

impl SsimOptions {
    /// `L`, the dynamic range the stability constants are scaled by.
    #[inline]
    pub fn dynamic_range(&self) -> f64 {
        2f64.powi(self.bit_depth as i32) - 1.0
    }
}

/// A metric score and the local map it was pooled from.
#[derive(Clone, Debug)]
pub struct SsimOutcome {
    /// Pooled score. 1.0 means identical for every variant.
    pub score: f64,
    /// Per-window scores, row-major.
    pub map: Vec<f32>,
    pub map_width: usize,
    pub map_height: usize,
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
    fn a_plane_takes_its_dimensions_from_the_view() {
        let data = rgba(4, 3, 128);
        let plane = Plane::from_rgba8(Rgba8::new(&data, 4, 3)).unwrap();
        assert_eq!((plane.width, plane.height), (4, 3));
        assert_eq!(plane.samples.len(), 12);
    }

    #[test]
    fn a_short_buffer_is_rejected() {
        let data = rgba(4, 3, 128);
        assert!(matches!(
            Plane::from_rgba8(Rgba8::new(&data, 8, 3)),
            Err(SsimError::Options(_))
        ));
    }

    #[test]
    fn mismatched_planes_are_rejected() {
        let plane = |width, height| Plane {
            samples: vec![0.0; width * height],
            width,
            height,
        };
        assert!(matches!(
            Plane::validate_pair(&plane(4, 4), &plane(2, 4)),
            Err(SsimError::SizeMismatch { .. })
        ));
    }

    #[test]
    fn a_truncated_plane_is_rejected() {
        let full = Plane {
            samples: vec![0.0; 16],
            width: 4,
            height: 4,
        };
        let short = Plane {
            samples: vec![0.0; 4],
            width: 4,
            height: 4,
        };
        assert!(matches!(
            Plane::validate_pair(&full, &short),
            Err(SsimError::Options(_))
        ));
    }

    #[test]
    fn the_dynamic_range_follows_the_bit_depth() {
        assert_eq!(SsimOptions::default().dynamic_range(), 255.0);
        assert_eq!(
            SsimOptions {
                bit_depth: 16,
                ..Default::default()
            }
            .dynamic_range(),
            65535.0
        );
    }
}
