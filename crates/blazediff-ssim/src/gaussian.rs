//! 1-D Gaussian window generation.

/// Standard deviation MATLAB's `fspecial('gaussian', 11, 1.5)` uses, and the
/// only one any of the SSIM references vary from.
pub(crate) const SIGMA: f64 = 1.5;

/// Separable half of `fspecial('gaussian', size, sigma)`, normalised to sum 1.
///
/// The rounding sequence is deliberate and matches `packages/ssim`: taps are
/// evaluated and stored at `f32`, but the normalising sum accumulates the
/// unrounded `f64` values. Normalising by the rounded sum instead shifts the
/// window by ~1e-7 per tap, which is enough to move the last digits of the
/// score away from the JS package's measured MATLAB agreement.
pub(crate) fn window_1d(size: usize, sigma: f64) -> Vec<f32> {
    let mut window = vec![0f32; size];
    let center = (size as f64 - 1.0) / 2.0;
    let two_sigma_squared = 2.0 * sigma * sigma;
    let mut total = 0f64;

    for (i, tap) in window.iter_mut().enumerate() {
        let distance = i as f64 - center;
        let value = (-(distance * distance) / two_sigma_squared).exp();
        *tap = value as f32;
        total += value;
    }

    for tap in &mut window {
        *tap = (*tap as f64 / total) as f32;
    }

    window
}

/// Flat averaging window of `size` taps, the separable half of `ones(f,f)/f²`.
pub(crate) fn box_1d(size: usize) -> Vec<f32> {
    vec![1.0 / size as f32; size]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gaussian_window_is_normalised_and_symmetric() {
        let window = window_1d(11, SIGMA);
        assert_eq!(window.len(), 11);
        let total: f32 = window.iter().sum();
        assert!((total - 1.0).abs() < 1e-6, "sum was {total}");
        for i in 0..5 {
            assert!((window[i] - window[10 - i]).abs() < 1e-9);
        }
        assert!(window[5] > window[4]);
    }

    #[test]
    fn box_window_sums_to_one() {
        let window = box_1d(4);
        assert_eq!(window, vec![0.25; 4]);
    }
}
