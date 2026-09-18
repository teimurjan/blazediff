//! Row kernels for the mask finder's 3x3 convolutions.
//!
//! Activations are NHWC rows with a zero column on either side, so every
//! horizontal tap is a plain offset and the only branch is at the row level
//! (an out-of-image row is a shared all-zero row, see `network`). Lanes run
//! over output channels: for one `(tap, input channel)` the weights of sixteen
//! output channels are contiguous, and the input sample is broadcast. A
//! register block covers [`PX`] pixels by [`BLOCK_CHANNELS`] channels, so
//! each weight load feeds `PX` fused multiply-adds and each broadcast feeds
//! `BLOCK_CHANNELS / LANES`.
//!
//! PyTorch sums the taps in whatever order oneDNN picks; this sums bias first,
//! then taps in `dy, dx, ci` order. The two agree to a few ulps per layer,
//! which `tests/parity.rs` bounds end to end.

use crate::simd::{SimdF32, Vf32, LANES};
use crate::weights::Conv3x3;

/// Output channels per register block. Divides every hidden layer's width.
const BLOCK_CHANNELS: usize = 16;
/// Vectors per register block.
const CV: usize = BLOCK_CHANNELS / LANES;
/// Pixels per register block. Sixteen accumulators fit NEON's thirty-two
/// registers; the sixteen-register x86 files get half that unless AVX2's
/// wider lanes already halve `CV`.
const PX: usize = if cfg!(target_arch = "aarch64") || LANES == 8 {
    4
} else {
    2
};

/// Length of a bordered row: `width` pixels plus one zero pixel each side.
#[inline]
pub(crate) const fn bordered_len(width: usize, channels: usize) -> usize {
    (width + 2) * channels
}

/// One output row of a hidden layer: 3x3 same-convolution over the bordered
/// input rows above, at and below it, then ReLU. Writes columns `1..=width`
/// of `out`, leaving its border untouched.
pub(crate) fn conv_relu_row(layer: &Conv3x3, rows: [&[f32]; 3], width: usize, out: &mut [f32]) {
    let (cin, cout) = (layer.cin, layer.cout);
    assert_eq!(cout % BLOCK_CHANNELS, 0);
    assert!(rows.iter().all(|row| row.len() >= bordered_len(width, cin)));
    assert!(out.len() >= bordered_len(width, cout));

    let full = width / PX * PX;
    for co0 in (0..cout).step_by(BLOCK_CHANNELS) {
        let mut x = 0;
        while x < full {
            // SAFETY: bounds asserted above; the block reads pixels
            // `x..x + PX + 2` of each bordered row and writes `x + 1..x + 1 + PX`.
            unsafe { block::<PX>(layer, rows, x, co0, out) };
            x += PX;
        }
        while x < width {
            unsafe { block::<1>(layer, rows, x, co0, out) };
            x += 1;
        }
    }
}

/// `P` output pixels starting at column `x`, for the sixteen output channels
/// starting at `co0`.
#[inline(always)]
unsafe fn block<const P: usize>(
    layer: &Conv3x3,
    rows: [&[f32]; 3],
    x: usize,
    co0: usize,
    out: &mut [f32],
) {
    let (cin, cout) = (layer.cin, layer.cout);
    let weights = layer.weights.as_ptr();

    let mut acc = [[Vf32::splat(0.0); CV]; P];
    for v in 0..CV {
        let bias = Vf32::load(layer.bias.as_ptr().add(co0 + v * LANES));
        for pixel in acc.iter_mut() {
            pixel[v] = bias;
        }
    }

    for (dy, row) in rows.iter().enumerate() {
        for dx in 0..3 {
            // Output column `x` (zero-based) reads bordered columns
            // `x + dx` for `dx` in `0..3`, i.e. `x - 1..=x + 1` unbordered.
            let samples = row.as_ptr().add((x + dx) * cin);
            let taps = weights.add(((dy * 3 + dx) * cin) * cout + co0);
            for ci in 0..cin {
                let mut w = [Vf32::splat(0.0); CV];
                for (v, lane) in w.iter_mut().enumerate() {
                    *lane = Vf32::load(taps.add(ci * cout + v * LANES));
                }
                for (p, pixel) in acc.iter_mut().enumerate() {
                    let sample = Vf32::splat(*samples.add(p * cin + ci));
                    for v in 0..CV {
                        pixel[v] = pixel[v].mul_add(sample, w[v]);
                    }
                }
            }
        }
    }

    let zero = Vf32::splat(0.0);
    for (p, pixel) in acc.iter().enumerate() {
        let target = out.as_mut_ptr().add((x + 1 + p) * cout + co0);
        for (v, lane) in pixel.iter().enumerate() {
            lane.max(zero).store(target.add(v * LANES));
        }
    }
}

/// One output row of the single-channel last layer, before its sigmoid: bias
/// plus a 9 x `cin` dot product per pixel. Lanes run over input channels here,
/// since there is only one output. `out` is unbordered, `width` long.
pub(crate) fn conv_logit_row(layer: &Conv3x3, rows: [&[f32]; 3], width: usize, out: &mut [f32]) {
    let cin = layer.cin;
    assert_eq!(layer.cout, 1);
    assert_eq!(cin % LANES, 0);
    assert!(rows.iter().all(|row| row.len() >= bordered_len(width, cin)));
    assert!(out.len() >= width);
    let bias = layer.bias[0];

    for (x, logit) in out.iter_mut().enumerate().take(width) {
        let mut acc = Vf32::splat(0.0);
        for (dy, row) in rows.iter().enumerate() {
            for dx in 0..3 {
                let samples = &row[(x + dx) * cin..][..cin];
                let taps = &layer.weights[(dy * 3 + dx) * cin..][..cin];
                for v in (0..cin).step_by(LANES) {
                    // SAFETY: `v + LANES <= cin` and both slices are `cin` long.
                    unsafe {
                        acc = acc.mul_add(
                            Vf32::load(samples.as_ptr().add(v)),
                            Vf32::load(taps.as_ptr().add(v)),
                        );
                    }
                }
            }
        }
        *logit = acc.reduce_sum() + bias;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A layer whose weights are `tap * 100 + ci * 10 + co`, small enough
    /// to sum exactly in f32.
    fn layer(cin: usize, cout: usize) -> Conv3x3 {
        let mut weights = vec![0.0; 9 * cin * cout];
        for tap in 0..9 {
            for ci in 0..cin {
                for co in 0..cout {
                    weights[(tap * cin + ci) * cout + co] = (tap * 100 + ci * 10 + co) as f32;
                }
            }
        }
        Conv3x3 {
            cin,
            cout,
            weights,
            bias: (0..cout).map(|co| co as f32 * 0.5).collect(),
        }
    }

    /// Scalar reference: straight from the definition.
    fn reference(layer: &Conv3x3, rows: [&[f32]; 3], x: usize, co: usize) -> f32 {
        let mut total = layer.bias[co];
        for (dy, row) in rows.iter().enumerate() {
            for dx in 0..3 {
                for ci in 0..layer.cin {
                    let sample = row[(x + dx) * layer.cin + ci];
                    let weight = layer.weights[((dy * 3 + dx) * layer.cin + ci) * layer.cout + co];
                    total += sample * weight;
                }
            }
        }
        total
    }

    fn bordered_rows(width: usize, cin: usize, seed: f32) -> [Vec<f32>; 3] {
        std::array::from_fn(|dy| {
            let mut row = vec![0.0; bordered_len(width, cin)];
            for x in 1..=width {
                for ci in 0..cin {
                    let v = ((x * 7 + ci * 3 + dy * 5) % 11) as f32 - 5.0 + seed;
                    row[x * cin + ci] = v;
                }
            }
            row
        })
    }

    #[test]
    fn a_hidden_row_matches_the_definition_with_relu() {
        for width in [1, 2, 3, 5, 8, 13] {
            let layer = layer(7, 32);
            let rows = bordered_rows(width, 7, 0.25);
            let mut out = vec![7.0; bordered_len(width, 32)];
            conv_relu_row(&layer, [&rows[0], &rows[1], &rows[2]], width, &mut out);
            for x in 0..width {
                for co in 0..32 {
                    let expected =
                        reference(&layer, [&rows[0], &rows[1], &rows[2]], x, co).max(0.0);
                    let actual = out[(x + 1) * 32 + co];
                    assert!(
                        (actual - expected).abs() <= expected.abs() * 1e-5,
                        "width {width} x {x} co {co}: {actual} vs {expected}"
                    );
                }
            }
            // The border is never written.
            assert!(out[..32].iter().all(|v| *v == 7.0));
            assert!(out[(width + 1) * 32..].iter().all(|v| *v == 7.0));
        }
    }

    #[test]
    fn the_logit_row_matches_the_definition() {
        let layer = layer(16, 1);
        let width = 9;
        let rows = bordered_rows(width, 16, -0.5);
        let mut out = vec![0.0; width];
        conv_logit_row(&layer, [&rows[0], &rows[1], &rows[2]], width, &mut out);
        for (x, actual) in out.iter().enumerate() {
            let expected = reference(&layer, [&rows[0], &rows[1], &rows[2]], x, 0);
            assert!(
                (actual - expected).abs() <= expected.abs() * 1e-5,
                "x {x}: {actual} vs {expected}"
            );
        }
    }
}
