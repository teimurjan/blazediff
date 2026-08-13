//! Single-scale SSIM with the automatic downsampling MATLAB's `ssim.m` does.
//!
//! Z. Wang, A. C. Bovik, H. R. Sheikh and E. P. Simoncelli, "Image quality
//! assessment: from error visibility to structural similarity," IEEE
//! Transactions on Image Processing 13(4), 2004.

use super::convolve::{convolve_valid, downsample, valid_scratch_len, valid_width};
use super::gaussian::{window_1d, SIGMA};
use super::simd::{square_and_cross, ssim_combine};
use super::{Plane, SsimOptions, SsimOutcome};
use crate::SsimError;
use std::borrow::Cow;

/// Longest edge MATLAB's `ssim.m` keeps before it low-passes and subsamples.
const DOWNSAMPLE_TARGET: f64 = 256.0;

/// Mean SSIM over `image1` and `image2`, plus the local map it was pooled from.
///
/// The images are reduced to luma, low-passed and subsampled by
/// `round(min(w, h) / 256)` when that is above 1, then compared through
/// Gaussian-weighted local statistics in `'valid'` mode. The returned map is at
/// the post-downsample, post-`'valid'` size — smaller than the input, exactly
/// as MATLAB's `ssim_map` is.
pub fn ssim(
    image1: &Plane,
    image2: &Plane,
    options: &SsimOptions,
) -> Result<SsimOutcome, SsimError> {
    Plane::validate_pair(image1, image2)?;

    let mut width = image1.width;
    let mut height = image1.height;

    let factor = (width.min(height) as f64 / DOWNSAMPLE_TARGET)
        .round()
        .max(1.0) as usize;
    let (luma1, luma2): (Cow<[f32]>, Cow<[f32]>) = if factor > 1 {
        let (down1, new_width, new_height) = downsample(&image1.samples, width, height, factor);
        let (down2, _, _) = downsample(&image2.samples, width, height, factor);
        width = new_width;
        height = new_height;
        (Cow::Owned(down1), Cow::Owned(down2))
    } else {
        (
            Cow::Borrowed(image1.samples.as_slice()),
            Cow::Borrowed(image2.samples.as_slice()),
        )
    };

    let window_size = options.window_size;
    if width < window_size || height < window_size {
        return Err(SsimError::InputTooSmall {
            width: width as u32,
            height: height as u32,
            minimum: window_size as u32,
        });
    }

    let window = window_1d(window_size, SIGMA);
    let dynamic_range = options.dynamic_range();
    let c1 = (options.k1 * dynamic_range).powi(2) as f32;
    let c2 = (options.k2 * dynamic_range).powi(2) as f32;

    let map_width = valid_width(width, window_size);
    let map_height = height + 1 - window_size;
    let map_len = map_width * map_height;

    let mut scratch = vec![0f32; valid_scratch_len(width, height, window_size)];
    let mut mu1 = vec![0f32; map_len];
    let mut mu2 = vec![0f32; map_len];
    convolve_valid(&luma1, &mut mu1, &mut scratch, width, height, &window);
    convolve_valid(&luma2, &mut mu2, &mut scratch, width, height, &window);

    let mut luma1_sq = vec![0f32; width * height];
    let mut luma2_sq = vec![0f32; width * height];
    let mut cross = vec![0f32; width * height];
    square_and_cross(&luma1, &luma2, &mut luma1_sq, &mut luma2_sq, &mut cross);

    let mut sigma1_sq = vec![0f32; map_len];
    let mut sigma2_sq = vec![0f32; map_len];
    let mut sigma12 = vec![0f32; map_len];
    convolve_valid(
        &luma1_sq,
        &mut sigma1_sq,
        &mut scratch,
        width,
        height,
        &window,
    );
    convolve_valid(
        &luma2_sq,
        &mut sigma2_sq,
        &mut scratch,
        width,
        height,
        &window,
    );
    convolve_valid(&cross, &mut sigma12, &mut scratch, width, height, &window);

    let mut map = vec![0f32; map_len];
    let total = ssim_combine(
        &mu1, &mu2, &sigma1_sq, &sigma2_sq, &sigma12, c1, c2, &mut map,
    );

    Ok(SsimOutcome {
        score: total / map_len as f64,
        map,
        map_width,
        map_height,
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
    fn identical_images_score_exactly_one() {
        let image = plane(64, 48, |x, y| ((x * 7 + y * 13) % 256) as f32);
        let outcome = ssim(&image, &image, &SsimOptions::default()).unwrap();
        assert_eq!(outcome.score, 1.0);
        assert!(outcome.map.iter().all(|value| *value == 1.0));
    }

    #[test]
    fn map_is_the_valid_convolution_size() {
        let image = plane(64, 48, |x, y| ((x + y) % 256) as f32);
        let outcome = ssim(&image, &image, &SsimOptions::default()).unwrap();
        assert_eq!(outcome.map_width, 64 - 10);
        assert_eq!(outcome.map_height, 48 - 10);
        assert_eq!(outcome.map.len(), outcome.map_width * outcome.map_height);
    }

    #[test]
    fn noise_scores_below_a_small_perturbation() {
        let base = plane(96, 96, |x, y| ((x * 3 + y * 5) % 200) as f32);
        let nudged = plane(96, 96, |x, y| ((x * 3 + y * 5) % 200) as f32 + 1.0);
        let scrambled = plane(96, 96, |x, y| (((x * 91 + y * 173) % 256) ^ 0x5a) as f32);

        let close = ssim(&base, &nudged, &SsimOptions::default()).unwrap().score;
        let far = ssim(&base, &scrambled, &SsimOptions::default())
            .unwrap()
            .score;
        assert!(close > 0.99, "close pair scored {close}");
        assert!(far < close, "{far} should be below {close}");
    }

    #[test]
    fn images_below_the_window_size_are_rejected() {
        let tiny = plane(8, 8, |_, _| 128.0);
        assert!(matches!(
            ssim(&tiny, &tiny, &SsimOptions::default()),
            Err(SsimError::InputTooSmall { .. })
        ));
    }

    #[test]
    fn large_images_are_downsampled_before_pooling() {
        // 512 on the short edge means factor 2, so the map is built from a
        // 256-wide plane rather than the full-resolution one.
        let image = plane(512, 512, |x, y| ((x ^ y) % 256) as f32);
        let outcome = ssim(&image, &image, &SsimOptions::default()).unwrap();
        assert_eq!(outcome.map_width, 256 - 10);
    }
}
