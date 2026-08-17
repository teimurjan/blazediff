//! Hitchhiker's SSIM: rectangular windows over integral images, pooled by
//! coefficient of variation.
//!
//! A. K. Venkataramanan, C. Wu, A. C. Bovik, I. Katsavounidis and Z. Shahid,
//! "A Hitchhiker's Guide to Structural Similarity," IEEE Access 9, 2021.
//! Independent implementation from the published algorithm; see
//! <https://github.com/teimurjan/blazediff/blob/main/licenses/HITCHHIKERS-SSIM.md>.

use super::simd::{sum, sum_squared_deviation};
use super::{Plane, SsimOptions, SsimOutcome};
use crate::SsimError;

/// Knobs specific to Hitchhiker's SSIM; the shared window and stability
/// constants live in [`SsimOptions`].
#[derive(Clone, Copy, Debug)]
pub struct HitchhikersOptions {
    /// Distance between window origins. `None` means non-overlapping windows,
    /// i.e. a stride equal to the window size.
    pub window_stride: Option<usize>,
    /// Pool with `1 - stddev/mean` instead of the plain mean. This is the
    /// paper's recommendation and correlates better with perceived quality.
    pub cov_pooling: bool,
}

impl Default for HitchhikersOptions {
    fn default() -> Self {
        Self {
            window_stride: None,
            cov_pooling: true,
        }
    }
}

/// Pooled Hitchhiker's SSIM, plus the local map it was pooled from.
///
/// Replacing the Gaussian window with a box window makes every window sum an
/// O(1) lookup into a summed-area table, so the cost is one linear pass to
/// build five integral images instead of ten 11-tap convolutions.
pub fn hitchhikers_ssim(
    image1: &Plane,
    image2: &Plane,
    options: &SsimOptions,
    hitchhikers_options: &HitchhikersOptions,
) -> Result<SsimOutcome, SsimError> {
    Plane::validate_pair(image1, image2)?;

    let (width, height) = (image1.width, image1.height);
    let window_size = options.window_size;
    if width < window_size || height < window_size {
        return Err(SsimError::InputTooSmall {
            width: width as u32,
            height: height as u32,
            minimum: window_size as u32,
        });
    }

    let stride = hitchhikers_options.window_stride.unwrap_or(window_size);
    if stride == 0 {
        return Err(SsimError::Options(
            "hitchhikers-ssim window stride must be at least 1".to_string(),
        ));
    }

    let dynamic_range = options.dynamic_range();
    let c1 = (options.k1 * dynamic_range).powi(2);
    let c2 = (options.k2 * dynamic_range).powi(2);

    let luma1 = &image1.samples;
    let luma2 = &image2.samples;

    // The squared and cross planes feed nothing but their own summed-area
    // table, so they are folded into the build instead of being materialised:
    // three fewer full-size planes, and the same `f32` product the reference
    // rounds through before widening.
    let integral1 = IntegralImage::build(width, height, |i| luma1[i]);
    let integral2 = IntegralImage::build(width, height, |i| luma2[i]);
    let integral1_sq = IntegralImage::build(width, height, |i| luma1[i] * luma1[i]);
    let integral2_sq = IntegralImage::build(width, height, |i| luma2[i] * luma2[i]);
    let integral12 = IntegralImage::build(width, height, |i| luma1[i] * luma2[i]);

    let map_width = (width - window_size) / stride + 1;
    let map_height = (height - window_size) / stride + 1;
    let mut map = vec![0f32; map_width * map_height];
    let window_area = (window_size * window_size) as f64;

    // Windows are strided, so vectorising across `x` would need gathers over
    // five tables to save five loads and one divide; the integral build above
    // is where the time actually goes.
    for y in 0..map_height {
        let top = y * stride;
        let bottom = top + window_size;
        for x in 0..map_width {
            let left = x * stride;
            let right = left + window_size;

            let mu1 = integral1.window_sum(left, top, right, bottom) / window_area;
            let mu2 = integral2.window_sum(left, top, right, bottom) / window_area;
            let mu1_sq = mu1 * mu1;
            let mu2_sq = mu2 * mu2;
            let mu1_mu2 = mu1 * mu2;

            let sigma1_sq =
                integral1_sq.window_sum(left, top, right, bottom) / window_area - mu1_sq;
            let sigma2_sq =
                integral2_sq.window_sum(left, top, right, bottom) / window_area - mu2_sq;
            let sigma12 = integral12.window_sum(left, top, right, bottom) / window_area - mu1_mu2;

            let numerator = (2.0 * mu1_mu2 + c1) * (2.0 * sigma12 + c2);
            let denominator = (mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2);
            map[y * map_width + x] = (numerator / denominator) as f32;
        }
    }

    let score = if hitchhikers_options.cov_pooling {
        coefficient_of_variation_score(&map)
    } else {
        sum(&map) / map.len() as f64
    };

    Ok(SsimOutcome {
        score,
        map,
        map_width,
        map_height,
    })
}

/// Summed-area table with a zero row and column, so a window sum is four
/// unconditional lookups.
struct IntegralImage {
    data: Vec<f64>,
    stride: usize,
}

impl IntegralImage {
    /// `sample(index)` yields the plane value at a row-major pixel index.
    fn build(width: usize, height: usize, sample: impl Fn(usize) -> f32) -> Self {
        let stride = width + 1;
        let mut data = vec![0f64; stride * (height + 1)];
        // Split into a sequential row prefix and a whole-row add of the row
        // above: the second half is a plain elementwise loop, which the
        // compiler vectorises, unlike the four-term recurrence it replaces.
        let mut prefix = vec![0f64; width];
        for y in 0..height {
            let mut running = 0f64;
            for (x, slot) in prefix.iter_mut().enumerate() {
                running += sample(y * width + x) as f64;
                *slot = running;
            }
            let (above, current) = data.split_at_mut((y + 1) * stride);
            let above = &above[y * stride + 1..][..width];
            let current = &mut current[1..][..width];
            for ((slot, up), left) in current.iter_mut().zip(above).zip(&prefix) {
                *slot = up + left;
            }
        }
        Self { data, stride }
    }

    /// Sum over `[left, right) × [top, bottom)` of the source plane.
    #[inline]
    fn window_sum(&self, left: usize, top: usize, right: usize, bottom: usize) -> f64 {
        self.data[bottom * self.stride + right]
            - self.data[top * self.stride + right]
            - self.data[bottom * self.stride + left]
            + self.data[top * self.stride + left]
    }
}

/// `1 - stddev/mean`, so higher stays better and identical images give 1.0.
fn coefficient_of_variation_score(map: &[f32]) -> f64 {
    let mean = sum(map) / map.len() as f64;
    let variance = sum_squared_deviation(map, mean as f32) / map.len() as f64;
    if mean > 0.0 {
        1.0 - variance.sqrt() / mean
    } else {
        1.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plane(width: usize, height: usize, f: impl Fn(usize, usize) -> f32) -> Plane {
        Plane {
            samples: (0..width * height)
                .map(|i| f(i % width, i / width))
                .collect(),
            width,
            height,
        }
    }

    #[test]
    fn integral_window_sums_match_direct_summation() {
        let (width, height) = (17, 13);
        let samples: Vec<f32> = (0..width * height).map(|i| (i % 29) as f32).collect();
        let integral = IntegralImage::build(width, height, |i| samples[i]);

        for (left, top, right, bottom) in [(0, 0, 17, 13), (3, 2, 14, 11), (5, 5, 6, 6)] {
            let expected: f64 = (top..bottom)
                .flat_map(|y| (left..right).map(move |x| (y, x)))
                .map(|(y, x)| samples[y * width + x] as f64)
                .sum();
            let actual = integral.window_sum(left, top, right, bottom);
            assert!((actual - expected).abs() < 1e-6, "{actual} vs {expected}");
        }
    }

    #[test]
    fn identical_images_score_one() {
        let image = plane(64, 48, |x, y| ((x * 7 + y * 13) % 256) as f32);
        let outcome = hitchhikers_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &HitchhikersOptions::default(),
        )
        .unwrap();
        assert!((outcome.score - 1.0).abs() < 1e-12, "{}", outcome.score);
        assert!(outcome.map.iter().all(|value| (value - 1.0).abs() < 1e-6));
    }

    #[test]
    fn map_covers_non_overlapping_windows_by_default() {
        let image = plane(64, 48, |x, y| ((x + y) % 256) as f32);
        let outcome = hitchhikers_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &HitchhikersOptions::default(),
        )
        .unwrap();
        assert_eq!(outcome.map_width, (64 - 11) / 11 + 1);
        assert_eq!(outcome.map_height, (48 - 11) / 11 + 1);
    }

    #[test]
    fn stride_one_produces_a_dense_map() {
        let image = plane(64, 48, |x, y| ((x + y) % 256) as f32);
        let outcome = hitchhikers_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &HitchhikersOptions {
                window_stride: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(outcome.map_width, 64 - 11 + 1);
        assert_eq!(outcome.map_height, 48 - 11 + 1);
    }

    #[test]
    fn mean_pooling_is_available_and_differs_from_cov() {
        let base = plane(96, 96, |x, y| ((x * 5 + y * 3) % 240) as f32);
        let scrambled = plane(96, 96, |x, y| (((x * 91 + y * 173) % 256) ^ 0x5a) as f32);
        let options = SsimOptions::default();

        let cov = hitchhikers_ssim(&base, &scrambled, &options, &HitchhikersOptions::default())
            .unwrap()
            .score;
        let mean = hitchhikers_ssim(
            &base,
            &scrambled,
            &options,
            &HitchhikersOptions {
                cov_pooling: false,
                ..Default::default()
            },
        )
        .unwrap()
        .score;
        assert!((cov - mean).abs() > 1e-6);
    }

    #[test]
    fn images_below_the_window_size_are_rejected() {
        let tiny = plane(8, 8, |_, _| 128.0);
        assert!(matches!(
            hitchhikers_ssim(
                &tiny,
                &tiny,
                &SsimOptions::default(),
                &HitchhikersOptions::default()
            ),
            Err(SsimError::InputTooSmall { .. })
        ));
    }
}
