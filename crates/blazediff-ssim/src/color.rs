//! sRGB → linear light → CIE L\*a\*b\*, for the perceptual metric.
//!
//! Two separate reasons to leave gamma-encoded space, and they want different
//! stages of the pipeline:
//!
//! - **Downscaling** has to happen in *linear light*, because averaging pixels
//!   models light hitting a sensor. Averaging gamma-encoded values darkens the
//!   result and understates the distortion that survives to a lower scale.
//! - **Comparing** wants a *perceptually uniform* space, because SSIM's
//!   constants assume a step of one unit means roughly the same thing
//!   everywhere. Linear light does not have that property; L\* does.
//!
//! All standard colour science — sRGB IEC 61966-2-1 transfer function, the
//! sRGB/D65 primaries matrix, and the CIE L\*a\*b\* definition.

use std::sync::OnceLock;

/// D65 white point in XYZ, the reference sRGB is defined against.
const WHITE: [f32; 3] = [0.950_47, 1.0, 1.088_83];

/// `(6/29)^3`, the knee where the L\* transfer switches to its linear segment.
const EPSILON: f32 = 216.0 / 24389.0;
/// `(29/3)^3 / 27`, the slope of that linear segment.
const KAPPA: f32 = 24389.0 / 27.0;

/// sRGB byte → linear light in `0..=1`, tabulated because the input is a byte.
fn transfer_table() -> &'static [f32; 256] {
    static TABLE: OnceLock<[f32; 256]> = OnceLock::new();
    TABLE.get_or_init(|| {
        std::array::from_fn(|value| {
            let encoded = value as f32 / 255.0;
            if encoded <= 0.040_45 {
                encoded / 12.92
            } else {
                ((encoded + 0.055) / 1.055).powf(2.4)
            }
        })
    })
}

/// Three linear-light planes, the form the pyramid downscales in.
pub(crate) struct LinearRgb {
    pub red: Vec<f32>,
    pub green: Vec<f32>,
    pub blue: Vec<f32>,
}

impl LinearRgb {
    /// Three planes with room for `capacity` samples, for a pyramid level that
    /// has not been filled yet.
    pub(crate) fn zeroed(capacity: usize) -> Self {
        Self {
            red: vec![0f32; capacity],
            green: vec![0f32; capacity],
            blue: vec![0f32; capacity],
        }
    }

    /// Halve all three planes into `target`, returning the new size.
    pub(crate) fn halve_into(
        &self,
        width: usize,
        height: usize,
        target: &mut LinearRgb,
    ) -> (usize, usize) {
        let size = super::convolve::halve_into(&self.red, width, height, &mut target.red);
        super::convolve::halve_into(&self.green, width, height, &mut target.green);
        super::convolve::halve_into(&self.blue, width, height, &mut target.blue);
        size
    }
}

/// Un-gamma an RGBA8 buffer into linear-light planes. Alpha is ignored, as it
/// is everywhere else in the SSIM family.
pub(crate) fn to_linear_rgb(rgba: &[u8]) -> LinearRgb {
    let table = transfer_table();
    // One pass per channel rather than one pass pushing to three vectors: the
    // interleaved pushes serialise on three separate length updates, while a
    // collect over an exact-size iterator writes straight into the allocation.
    let channel = |offset: usize| -> Vec<f32> {
        rgba.chunks_exact(4)
            .map(|pixel| table[pixel[offset] as usize])
            .collect()
    };
    LinearRgb {
        red: channel(0),
        green: channel(1),
        blue: channel(2),
    }
}

/// Convert the first `len` samples of a level's linear-light planes to
/// L\*a\*b\*, each channel rescaled to the `0..=255` range the shared stability
/// constants (`c1 = (k1·255)²`) are written for.
///
/// L\* is `0..=100` natively and a\*/b\* are roughly `-128..=127`, so without
/// this rescale the same `k1`/`k2` would mean something different per channel.
///
/// Writes into caller-owned planes: the pyramid derives L\*a\*b\* afresh at
/// every level, so returning fresh `Vec`s would allocate and fault in three
/// full-size buffers per level per side.
pub(crate) fn linear_rgb_to_lab_into(
    linear: &LinearRgb,
    len: usize,
    lightness: &mut [f32],
    green_red: &mut [f32],
    blue_yellow: &mut [f32],
) {
    for i in 0..len {
        let (r, g, b) = (linear.red[i], linear.green[i], linear.blue[i]);
        // sRGB (D65) primaries.
        let x = 0.412_456_4 * r + 0.357_576_1 * g + 0.180_437_5 * b;
        let y = 0.212_672_9 * r + 0.715_152_2 * g + 0.072_175_0 * b;
        let z = 0.019_333_9 * r + 0.119_192 * g + 0.950_304_1 * b;

        let fx = lab_transfer(x / WHITE[0]);
        let fy = lab_transfer(y / WHITE[1]);
        let fz = lab_transfer(z / WHITE[2]);

        // 0..100 -> 0..255, and -128..127 -> 0..255.
        lightness[i] = (116.0 * fy - 16.0) * 2.55;
        green_red[i] = 500.0 * (fx - fy) + 128.0;
        blue_yellow[i] = 200.0 * (fy - fz) + 128.0;
    }
}

/// The L\* transfer function, written branch-free so the whole conversion
/// vectorises: both arms are cheap arithmetic and the compiler selects between
/// them, where a `libm` call in one arm would pin the loop to one pixel at a
/// time.
#[inline]
fn lab_transfer(ratio: f32) -> f32 {
    let root = cube_root(ratio);
    let knee = (KAPPA * ratio + 16.0) / 116.0;
    if ratio > EPSILON {
        root
    } else {
        knee
    }
}

/// Seed for `x^(-1/3)`: a third of the biased exponent, with the usual mantissa
/// correction, lands within about 5% of the answer.
const INVERSE_CUBE_ROOT_SEED: u32 = 1_419_967_081;

/// `x.cbrt()` for finite `x >= 0`, without the scalar `libm` call.
///
/// Three cube roots per pixel per side per pyramid level makes this the single
/// hottest operation in the perceptual metric, and `cbrtf` is both a call and
/// unvectorisable. Newton on `z = x^(-1/3)` avoids it: `z <- z·(4 - x·z³)/3`
/// needs no division, and its error squares every step. Two steps in `f32` take
/// the seed to about `5e-5`, two more in `f64` take it past `f64`'s own
/// rounding, so `x·z²` rounds to the same `f32` the library returns —
/// exhaustively checked over the range L\*a\*b\* can ask for by
/// `the_cube_root_matches_libm_over_the_whole_lab_domain`.
#[inline]
fn cube_root(x: f32) -> f32 {
    let mut estimate = f32::from_bits(INVERSE_CUBE_ROOT_SEED - x.to_bits() / 3);
    estimate *= (4.0 - x * estimate * estimate * estimate) * (1.0 / 3.0);
    estimate *= (4.0 - x * estimate * estimate * estimate) * (1.0 / 3.0);

    let wide = x as f64;
    let mut root = estimate as f64;
    root *= (4.0 - wide * root * root * root) * (1.0 / 3.0);
    root *= (4.0 - wide * root * root * root) * (1.0 / 3.0);
    (wide * root * root) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lab_of(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
        let linear = to_linear_rgb(&[r, g, b, 255]);
        let (mut lightness, mut green_red, mut blue_yellow) = ([0f32], [0f32], [0f32]);
        linear_rgb_to_lab_into(&linear, 1, &mut lightness, &mut green_red, &mut blue_yellow);
        (
            lightness[0] / 2.55,
            green_red[0] - 128.0,
            blue_yellow[0] - 128.0,
        )
    }

    /// Highest ratio any of `X/Xn`, `Y/Yn`, `Z/Zn` can reach: the primaries
    /// matrix rows sum to the white point, and linear light is in `0..=1`.
    const MAX_RATIO: f32 = 1.000_001;

    /// Every `f32` the transfer function can be handed, against the library
    /// this replaced. Bit-exact is the requirement, not close: the metric's
    /// published numbers were measured with `cbrtf`.
    ///
    /// About 67M values, so it is behind `--ignored`; the strided version below
    /// runs every time.
    #[test]
    #[ignore = "exhaustive: ~67M values, run with --release --ignored"]
    fn the_cube_root_matches_libm_over_the_whole_lab_domain() {
        let mut mismatches = 0u64;
        for bits in EPSILON.to_bits()..=MAX_RATIO.to_bits() {
            let value = f32::from_bits(bits);
            if cube_root(value) != value.cbrt() {
                mismatches += 1;
                if mismatches < 8 {
                    eprintln!("{value:e}: {:e} vs {:e}", cube_root(value), value.cbrt());
                }
            }
        }
        assert_eq!(
            mismatches,
            0,
            "of {} values",
            MAX_RATIO.to_bits() - EPSILON.to_bits()
        );
    }

    #[test]
    fn the_cube_root_matches_libm_across_the_lab_domain() {
        for bits in (EPSILON.to_bits()..=MAX_RATIO.to_bits()).step_by(509) {
            let value = f32::from_bits(bits);
            assert_eq!(cube_root(value), value.cbrt(), "at {value:e}");
        }
        // The knee arm covers everything below, but the root still has to be
        // finite there rather than a NaN the select would have to dodge.
        for value in [0.0f32, f32::MIN_POSITIVE, EPSILON, 1.0, 8.0, 1e30] {
            assert_eq!(cube_root(value), value.cbrt(), "at {value:e}");
        }
    }

    #[test]
    fn the_transfer_function_hits_its_endpoints() {
        let table = transfer_table();
        assert_eq!(table[0], 0.0);
        assert!((table[255] - 1.0).abs() < 1e-6);
        // Mid-grey sRGB is far below mid-grey linear — the whole point.
        assert!(table[128] < 0.25, "got {}", table[128]);
    }

    #[test]
    fn white_and_black_land_on_the_lightness_axis() {
        let (l, a, b) = lab_of(255, 255, 255);
        assert!((l - 100.0).abs() < 0.05, "L* {l}");
        assert!(a.abs() < 0.05 && b.abs() < 0.05, "a* {a} b* {b}");

        let (l, a, b) = lab_of(0, 0, 0);
        assert!(l.abs() < 1e-4, "L* {l}");
        assert!(a.abs() < 1e-4 && b.abs() < 1e-4);
    }

    #[test]
    fn primaries_land_in_the_right_quadrants() {
        // Published sRGB->Lab values: red ~ (53.2, 80.1, 67.2),
        // green ~ (87.7, -86.2, 83.2), blue ~ (32.3, 79.2, -107.9).
        let (l, a, b) = lab_of(255, 0, 0);
        assert!((l - 53.2).abs() < 0.5 && (a - 80.1).abs() < 0.5 && (b - 67.2).abs() < 0.5);

        let (l, a, b) = lab_of(0, 255, 0);
        assert!((l - 87.7).abs() < 0.5 && (a + 86.2).abs() < 0.5 && (b - 83.2).abs() < 0.5);

        let (l, a, b) = lab_of(0, 0, 255);
        assert!((l - 32.3).abs() < 0.5 && (a - 79.2).abs() < 0.5 && (b + 107.9).abs() < 0.5);
    }

    #[test]
    fn equal_luma_colours_separate_in_chroma() {
        // The pair the luma-only metrics cannot tell apart.
        let (l1, a1, b1) = lab_of(200, 30, 60);
        let (l2, a2, b2) = lab_of(111, 39, 247);
        let chroma_distance = ((a1 - a2).powi(2) + (b1 - b2).powi(2)).sqrt();
        assert!(
            chroma_distance > 50.0,
            "a*b* distance {chroma_distance} should be large; L* {l1} vs {l2}"
        );
    }
}
