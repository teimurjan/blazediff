//! RGBA → luma conversion for the SSIM metrics.

/// MATLAB/Octave `rgb2gray` coefficients (the YIQ luminance row). The SSIM
/// references all run on `rgb2gray(imread(...))`, so the port has to use the
/// same weights rather than the YIQ constants blazediff's pixel diff uses.
const R_WEIGHT: f32 = 0.298936;
const G_WEIGHT: f32 = 0.587043;
const B_WEIGHT: f32 = 0.114021;

/// Convert an RGBA8 buffer to a plane of luma samples in `0..=255`.
///
/// Left as a straight loop rather than hand-vectorised: it is a single
/// multiply-accumulate over a byte stream, memory-bound, and under 2% of any
/// metric's runtime — the convolutions in `super::convolve` run 10 passes of
/// 11 taps over the same pixels. Deinterleaving RGBA into vector lanes would
/// cost more code than it saves time.
pub(crate) fn to_luma(rgba: &[u8]) -> Vec<f32> {
    rgba.chunks_exact(4)
        .map(|pixel| {
            pixel[0] as f32 * R_WEIGHT + pixel[1] as f32 * G_WEIGHT + pixel[2] as f32 * B_WEIGHT
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn white_maps_to_full_range_and_black_to_zero() {
        let luma = to_luma(&[255, 255, 255, 255, 0, 0, 0, 255]);
        assert!((luma[0] - 255.0).abs() < 0.01);
        assert_eq!(luma[1], 0.0);
    }

    #[test]
    fn alpha_is_ignored() {
        let opaque = to_luma(&[10, 20, 30, 255]);
        let transparent = to_luma(&[10, 20, 30, 0]);
        assert_eq!(opaque, transparent);
    }

    #[test]
    fn channels_are_weighted_like_rgb2gray() {
        let luma = to_luma(&[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
        assert!((luma[0] - 255.0 * R_WEIGHT).abs() < 1e-3);
        assert!((luma[1] - 255.0 * G_WEIGHT).abs() < 1e-3);
        assert!((luma[2] - 255.0 * B_WEIGHT).abs() < 1e-3);
    }
}
