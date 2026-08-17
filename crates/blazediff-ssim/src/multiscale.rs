//! MS-SSIM: SSIM pooled across a dyadic scale pyramid.
//!
//! Z. Wang, E. P. Simoncelli and A. C. Bovik, "Multi-scale structural
//! similarity for image quality assessment," IEEE Asilomar Conference on
//! Signals, Systems and Computers, 2003.

use super::convolve::halve_into;
use super::gaussian::{window_1d, SIGMA};
use super::stats::{scale_statistics_into, Workspace};
use super::{Plane, SsimOptions, SsimOutcome};
use crate::SsimError;

/// Per-scale weights from the MS-SSIM paper. The number of entries is the
/// number of scales, so `weights.len()` replaces MATLAB's separate `level`.
pub const DEFAULT_WEIGHTS: [f64; 5] = [0.0448, 0.2856, 0.3001, 0.2363, 0.1333];

/// How the per-scale scores are pooled into one number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum MsSsimMethod {
    /// `∏ mcs_l^w_l · mssim_L^w_L` — MATLAB's default.
    #[default]
    Product,
    /// `Σ mcs_l·w_l + mssim_L·w_L` with the weights renormalised to sum 1.
    WeightedSum,
}

/// Knobs specific to MS-SSIM; the shared window and stability constants live
/// in [`SsimOptions`].
#[derive(Clone, Debug)]
pub struct MsSsimOptions {
    pub weights: Vec<f64>,
    pub method: MsSsimMethod,
}

impl Default for MsSsimOptions {
    fn default() -> Self {
        Self {
            weights: DEFAULT_WEIGHTS.to_vec(),
            method: MsSsimMethod::default(),
        }
    }
}

/// Pooled multi-scale SSIM, plus the local map from the coarsest scale.
///
/// Each scale contributes its contrast-structure mean; only the coarsest one
/// contributes a full SSIM mean, matching `msssim.m`. Unlike single-scale
/// SSIM, the per-scale statistics use symmetric `'same'` filtering, so the map
/// is the size of the coarsest plane rather than a `'valid'` crop of it.
///
/// [`MsSsimMethod::Product`] returns `NaN` when a scale's mean
/// contrast-structure term goes negative, which takes globally anticorrelated
/// content (an inverted image, say) rather than ordinary degradation: raising a
/// negative base to a fractional power has no real value. Both reference
/// implementations degenerate the same way — the JS gives `NaN`, MATLAB gives a
/// complex number — so the behaviour is kept rather than papered over.
/// [`MsSsimMethod::WeightedSum`] stays finite throughout.
pub fn ms_ssim(
    image1: &Plane,
    image2: &Plane,
    options: &SsimOptions,
    ms_options: &MsSsimOptions,
) -> Result<SsimOutcome, SsimError> {
    Plane::validate_pair(image1, image2)?;

    let scales = ms_options.weights.len();
    if scales == 0 {
        return Err(SsimError::Options(
            "ms-ssim needs at least one scale weight".to_string(),
        ));
    }

    // MATLAB refuses the whole computation when the coarsest plane would be
    // narrower than the window, rather than silently pooling garbage.
    let window_size = options.window_size;
    let smallest = image1.width.min(image1.height) >> (scales - 1);
    if smallest < window_size {
        return Err(SsimError::InputTooSmall {
            width: image1.width as u32,
            height: image1.height as u32,
            minimum: (window_size << (scales - 1)) as u32,
        });
    }

    let window = window_1d(window_size, SIGMA);
    let dynamic_range = options.dynamic_range();
    let c1 = (options.k1 * dynamic_range).powi(2) as f32;
    let c2 = (options.k2 * dynamic_range).powi(2) as f32;

    let mut luma1 = image1.samples.clone();
    let mut luma2 = image2.samples.clone();
    let mut width = image1.width;
    let mut height = image1.height;

    // Every buffer the pyramid needs, sized for the finest level and re-sliced
    // on the way down; the halved planes ping-pong through the spares.
    let full = width * height;
    let mut workspace = Workspace::new(width, window_size);
    let mut map = vec![0f32; full];
    let mut cs_map = vec![0f32; full];
    let mut spare1 = vec![0f32; full / 4 + 1];
    let mut spare2 = vec![0f32; full / 4 + 1];

    let mut ssim_per_scale = Vec::with_capacity(scales);
    let mut cs_per_scale = Vec::with_capacity(scales);
    let mut coarsest_map = Vec::new();

    for scale in 0..scales {
        let (ssim_sum, cs_sum) = scale_statistics_into(
            &luma1,
            &luma2,
            width,
            height,
            &window,
            c1,
            c2,
            &mut workspace,
            &mut map,
            &mut cs_map,
        );
        let len = (width * height) as f64;
        ssim_per_scale.push(ssim_sum / len);
        cs_per_scale.push(cs_sum / len);

        if scale == scales - 1 {
            coarsest_map = map[..width * height].to_vec();
            break;
        }

        let (next_width, next_height) = halve_into(&luma1, width, height, &mut spare1);
        halve_into(&luma2, width, height, &mut spare2);
        std::mem::swap(&mut luma1, &mut spare1);
        std::mem::swap(&mut luma2, &mut spare2);
        width = next_width;
        height = next_height;
    }

    // Every scale but the coarsest contributes contrast-structure only; the
    // coarsest contributes full SSIM.
    let last = scales - 1;
    let coarse_to_fine = cs_per_scale[..last].iter().zip(&ms_options.weights[..last]);
    let score = match ms_options.method {
        MsSsimMethod::Product => {
            let product = coarse_to_fine.fold(1.0, |acc, (cs, weight)| acc * cs.powf(*weight));
            product * ssim_per_scale[last].powf(ms_options.weights[last])
        }
        MsSsimMethod::WeightedSum => {
            let total: f64 = ms_options.weights.iter().sum();
            let sum = coarse_to_fine
                .map(|(cs, weight)| cs * (weight / total))
                .sum::<f64>();
            sum + ssim_per_scale[last] * (ms_options.weights[last] / total)
        }
    };

    Ok(SsimOutcome {
        score,
        map: coarsest_map,
        map_width: width,
        map_height: height,
    })
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
    fn identical_images_score_one() {
        let image = plane(256, 256, |x, y| ((x * 7 + y * 13) % 256) as f32);
        let outcome = ms_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &MsSsimOptions::default(),
        )
        .unwrap();
        assert!((outcome.score - 1.0).abs() < 1e-12, "{}", outcome.score);
    }

    #[test]
    fn map_comes_from_the_coarsest_scale() {
        let image = plane(256, 256, |x, y| ((x ^ y) % 256) as f32);
        let outcome = ms_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &MsSsimOptions::default(),
        )
        .unwrap();
        assert_eq!(outcome.map_width, 16);
        assert_eq!(outcome.map_height, 16);
        assert_eq!(outcome.map.len(), 256);
    }

    #[test]
    fn images_too_small_for_the_pyramid_are_rejected() {
        let small = plane(128, 128, |_, _| 100.0);
        assert!(matches!(
            ms_ssim(
                &small,
                &small,
                &SsimOptions::default(),
                &MsSsimOptions::default()
            ),
            Err(SsimError::InputTooSmall { .. })
        ));
    }

    #[test]
    fn weighted_sum_and_product_agree_on_identical_images() {
        let image = plane(256, 256, |x, y| ((x * 3 + y) % 251) as f32);
        let product = ms_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &MsSsimOptions::default(),
        )
        .unwrap();
        let weighted = ms_ssim(
            &image,
            &image,
            &SsimOptions::default(),
            &MsSsimOptions {
                method: MsSsimMethod::WeightedSum,
                ..Default::default()
            },
        )
        .unwrap();
        assert!((product.score - weighted.score).abs() < 1e-9);
    }

    #[test]
    fn degraded_images_score_below_intact_ones() {
        let base = plane(256, 256, |x, y| ((x * 5 + y * 3) % 240) as f32);
        let nudged = plane(256, 256, |x, y| ((x * 5 + y * 3) % 240) as f32 + 2.0);
        let scrambled = plane(256, 256, |x, y| (((x * 91 + y * 173) % 256) ^ 0x5a) as f32);

        let options = SsimOptions::default();
        let close = ms_ssim(&base, &nudged, &options, &MsSsimOptions::default())
            .unwrap()
            .score;
        let far = ms_ssim(&base, &scrambled, &options, &MsSsimOptions::default())
            .unwrap()
            .score;
        assert!(close > far, "{close} should beat {far}");
    }
}
