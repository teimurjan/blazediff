//! The mask finder as a line-buffer pipeline, and the scaler MLP.
//!
//! The reference runs each layer over the whole image before the next, which
//! at 1080p means a 64-channel f32 tensor of half a gigabyte for layer two
//! alone. Nothing needs it: a 3x3 layer only ever reads three rows of the one
//! below, so each stage keeps a ring of three rows and the five stages advance
//! together, one row apart. A band of output rows costs a few rows of halo
//! per stage and a few megabytes, whatever the image size, and bands are
//! independent, which is what lets `metric` spread them over threads.

use crate::conv::{bordered_len, conv_logit_row, conv_relu_row};
use crate::weights::{Network, Scaler, SCALER_WIDTH};

/// One pyramid level's inputs, all `height * width` in row-major order.
pub(crate) struct Level<'a> {
    pub width: usize,
    pub height: usize,
    /// NHWC RGB in `0..=1`.
    pub reference: &'a [f32],
    pub distorted: &'a [f32],
    /// The coarser level's mask, upsampled to this one.
    pub mask_in: &'a [f32],
}

/// Depth of the mask finder, and so the number of rows an output row lags
/// its input by.
const STAGES: usize = 5;

/// Three bordered rows of one stage's activations, indexed by image row,
/// plus the all-zero row that stands in for rows outside the image (the
/// convolutions' zero padding).
struct Ring {
    rows: Vec<f32>,
    zero: Vec<f32>,
    stride: usize,
    height: isize,
}

impl Ring {
    fn new(width: usize, channels: usize, height: usize) -> Self {
        let stride = bordered_len(width, channels);
        Self {
            rows: vec![0.0; 3 * stride],
            zero: vec![0.0; stride],
            stride,
            height: height as isize,
        }
    }

    fn row(&self, r: isize) -> &[f32] {
        if r < 0 || r >= self.height {
            return &self.zero;
        }
        &self.rows[(r as usize % 3) * self.stride..][..self.stride]
    }

    fn row_mut(&mut self, r: usize) -> &mut [f32] {
        &mut self.rows[(r % 3) * self.stride..][..self.stride]
    }

    fn window(&self, r: isize) -> [&[f32]; 3] {
        [self.row(r - 1), self.row(r), self.row(r + 1)]
    }
}

/// Gather the seven input channels of image row `r`: reference RGB, distorted
/// RGB and the incoming mask, into a bordered row.
fn assemble_input_row(level: &Level, r: usize, out: &mut [f32]) {
    let width = level.width;
    let reference = &level.reference[r * width * 3..][..width * 3];
    let distorted = &level.distorted[r * width * 3..][..width * 3];
    let mask = &level.mask_in[r * width..][..width];
    for x in 0..width {
        let pixel = &mut out[(x + 1) * 7..][..7];
        pixel[..3].copy_from_slice(&reference[x * 3..][..3]);
        pixel[3..6].copy_from_slice(&distorted[x * 3..][..3]);
        pixel[6] = mask[x];
    }
}

#[inline]
pub(crate) fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

/// Compute mask rows `y0..y1` of one level into `out` (`(y1 - y0) * width`
/// floats): the finder's sigmoid plus the incoming mask, as the reference's
/// residual `mask_finder(...) + maskUpsampled`.
pub(crate) fn mask_rows(net: &Network, level: &Level, y0: usize, y1: usize, out: &mut [f32]) {
    let (width, height) = (level.width, level.height);
    debug_assert!(y0 < y1 && y1 <= height);
    debug_assert!(out.len() >= (y1 - y0) * width);

    let mut input = Ring::new(width, 7, height);
    let mut hidden: Vec<Ring> = net
        .hidden
        .iter()
        .map(|layer| Ring::new(width, layer.cout, height))
        .collect();
    let mut logits = vec![0.0; width];

    let (y0, y1) = (y0 as isize, y1 as isize);
    let lag = STAGES as isize;
    let in_image = |r: isize| r >= 0 && r < height as isize;

    // Step `t` assembles input row `t` and advances stage `k` to row `t - k`,
    // so every stage finds the three rows it needs already in the ring below.
    // Each stage only computes the rows the band's output actually depends on.
    for t in (y0 - lag)..(y1 + lag) {
        let needed = |k: isize| {
            let r = t - k;
            in_image(r) && r >= y0 - (lag - k) && r < y1 + (lag - k)
        };

        if needed(0) {
            assemble_input_row(level, t as usize, input.row_mut(t as usize));
        }

        for k in 1..=net.hidden.len() {
            if !needed(k as isize) {
                continue;
            }
            let r = t - k as isize;
            // The window borrows the ring below the one being written; the
            // borrow checker can't see they are different elements through
            // an index, hence the split.
            let (below, above) = hidden.split_at_mut(k - 1);
            let window = if k == 1 {
                input.window(r)
            } else {
                below[k - 2].window(r)
            };
            conv_relu_row(
                &net.hidden[k - 1],
                window,
                width,
                above[0].row_mut(r as usize),
            );
        }

        if needed(lag) {
            let r = t - lag;
            conv_logit_row(&net.last, hidden[3].window(r), width, &mut logits);
            let mask_in = &level.mask_in[r as usize * width..][..width];
            let target = &mut out[(r - y0) as usize * width..][..width];
            for ((mask, logit), residual) in target.iter_mut().zip(&logits).zip(mask_in) {
                *mask = sigmoid(*logit) + residual;
            }
        }
    }
}

#[inline]
fn leaky_relu(x: f32) -> f32 {
    if x > 0.0 {
        x
    } else {
        x * 0.2
    }
}

impl Scaler {
    /// The MLP the reference wraps in `ScalerNetwork`: `sigmoid(W2
    /// leaky(W1 leaky(w0 x + b0) + b1) + b2)`.
    pub(crate) fn apply(&self, x: f32) -> f32 {
        let mut h1 = [0.0f32; SCALER_WIDTH];
        for (j, value) in h1.iter_mut().enumerate() {
            *value = leaky_relu(self.w0[j] * x + self.b0[j]);
        }
        let mut logit = self.b2;
        for k in 0..SCALER_WIDTH {
            let mut h2 = self.b1[k];
            for (weight, input) in self.w1[k].iter().zip(&h1) {
                h2 += weight * input;
            }
            logit += self.w2[k] * leaky_relu(h2);
        }
        sigmoid(logit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::weights::network;

    fn level_of(width: usize, height: usize) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
        let pixel = |i: usize, salt: usize| ((i * 37 + salt) % 97) as f32 / 97.0;
        let reference = (0..width * height * 3).map(|i| pixel(i, 1)).collect();
        let distorted = (0..width * height * 3).map(|i| pixel(i, 11)).collect();
        let mask_in = (0..width * height).map(|i| pixel(i, 5)).collect();
        (reference, distorted, mask_in)
    }

    #[test]
    fn bands_agree_with_a_single_pass() {
        let (width, height) = (23, 19);
        let (reference, distorted, mask_in) = level_of(width, height);
        let level = Level {
            width,
            height,
            reference: &reference,
            distorted: &distorted,
            mask_in: &mask_in,
        };
        let net = network();

        let mut whole = vec![0.0; width * height];
        mask_rows(net, &level, 0, height, &mut whole);

        let mut banded = vec![0.0; width * height];
        for (band, y0) in (0..height).step_by(4).enumerate() {
            let y1 = (y0 + 4).min(height);
            mask_rows(net, &level, y0, y1, &mut banded[y0 * width..y1 * width]);
            assert!(band < 6);
        }
        // Bit-exact: every output row is the same arithmetic whichever band
        // computes it, which is what makes the thread count irrelevant.
        assert_eq!(whole, banded);
    }

    #[test]
    fn the_residual_adds_the_incoming_mask() {
        let (width, height) = (16, 16);
        let (reference, distorted, mut mask_in) = level_of(width, height);
        let net = network();
        let mut with = vec![0.0; width * height];
        mask_rows(
            net,
            &Level {
                width,
                height,
                reference: &reference,
                distorted: &distorted,
                mask_in: &mask_in,
            },
            0,
            height,
            &mut with,
        );
        // Every mask is a sigmoid (saturating to 0 or 1 in f32) plus the
        // residual.
        for (mask, residual) in with.iter().zip(&mask_in) {
            assert!(*mask >= *residual && *mask <= *residual + 1.0);
        }
        mask_in.iter_mut().for_each(|v| *v = 0.0);
        let mut without = vec![0.0; width * height];
        mask_rows(
            net,
            &Level {
                width,
                height,
                reference: &reference,
                distorted: &distorted,
                mask_in: &mask_in,
            },
            0,
            height,
            &mut without,
        );
        assert!(without.iter().all(|v| (0.0..=1.0).contains(v)));
    }

    #[test]
    fn the_scaler_is_a_sigmoid_in_range() {
        let scaler = &network().scaler;
        for x in [0.0, 1e-4, 1e-3, 1e-2, 0.1, 1.0] {
            let s = scaler.apply(x);
            assert!(s > 0.0 && s < 1.0, "{x} -> {s}");
        }
        // More error, lower quality: the mapping is monotonic where it matters.
        assert!(scaler.apply(0.0) < scaler.apply(0.01));
        assert!(scaler.apply(0.01) < scaler.apply(0.1));
    }
}
