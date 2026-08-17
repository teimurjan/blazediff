//! Separable 2-D convolution in the two boundary modes the SSIM metrics need.
//!
//! Both passes accumulate tap-by-tap in ascending kernel order, which is the
//! order `packages/ssim` uses. Keeping it identical is what lets the Rust port
//! inherit the JS package's measured agreement with MATLAB instead of drifting
//! by an unknown amount.

use super::simd::{convolve_taps, scale_add, scale_into};

/// Scratch floats [`convolve_valid`] needs for a `width × height` input.
#[inline]
pub(crate) fn valid_scratch_len(width: usize, height: usize, kernel_size: usize) -> usize {
    height * valid_width(width, kernel_size)
}

#[inline]
pub(crate) fn valid_width(width: usize, kernel_size: usize) -> usize {
    width + 1 - kernel_size
}

/// `filter2(kernel, input, 'valid')` for a separable kernel.
///
/// `output` holds `(width - k + 1) × (height - k + 1)` floats and `scratch`
/// holds [`valid_scratch_len`] of them. The horizontal pass writes only the
/// columns the vertical pass can reach, so the clamped border columns the JS
/// reference computes are skipped entirely — the vertical pass never reads
/// them, making this a pure saving rather than a behaviour change.
pub(crate) fn convolve_valid(
    input: &[f32],
    output: &mut [f32],
    scratch: &mut [f32],
    width: usize,
    height: usize,
    kernel: &[f32],
) {
    let kernel_size = kernel.len();
    debug_assert!(width >= kernel_size && height >= kernel_size);
    let out_width = valid_width(width, kernel_size);
    let out_height = height + 1 - kernel_size;

    for y in 0..height {
        convolve_taps(
            &input[y * width..][..width],
            &mut scratch[y * out_width..][..out_width],
            kernel,
        );
    }

    for y in 0..out_height {
        let target_row = &mut output[y * out_width..][..out_width];
        scale_into(
            target_row,
            &scratch[y * out_width..][..out_width],
            kernel[0],
        );
        for (tap, weight) in kernel.iter().enumerate().skip(1) {
            scale_add(
                target_row,
                &scratch[(y + tap) * out_width..][..out_width],
                *weight,
            );
        }
    }
}

/// One row of the horizontal half of [`convolve_same_symmetric`].
///
/// Columns in `[pad, pad + interior)` read only in-bounds samples and go
/// through the vector kernels; the few columns on either side need per-tap
/// reflection and stay scalar. Split out so `super::stats` can drive the
/// horizontal pass a row at a time without duplicating the reflection rule.
pub(crate) fn horizontal_row_symmetric(row: &[f32], target: &mut [f32], kernel: &[f32]) {
    let width = row.len();
    let kernel_size = kernel.len();
    let pad = kernel_size / 2;
    let interior = width.saturating_add(1).saturating_sub(kernel_size);

    if interior > 0 {
        convolve_taps(row, &mut target[pad..pad + interior], kernel);
    }

    let border = (0..pad).chain(pad + interior..width);
    for x in border {
        let mut total = 0f32;
        for (tap, weight) in kernel.iter().enumerate() {
            let source = reflect(x as isize + tap as isize - pad as isize, width);
            total += row[source] * weight;
        }
        target[x] = total;
    }
}

/// `imfilter(input, kernel, 'symmetric', 'same')` for a separable kernel.
///
/// `output` and `scratch` both hold `width × height` floats. The reflection
/// rule is the JS one: negative indices fold about column 0 and overruns fold
/// about the last column, with a final clamp for kernels wider than the image.
pub(crate) fn convolve_same_symmetric(
    input: &[f32],
    output: &mut [f32],
    scratch: &mut [f32],
    width: usize,
    height: usize,
    kernel: &[f32],
) {
    let kernel_size = kernel.len();
    let pad = kernel_size / 2;

    for y in 0..height {
        horizontal_row_symmetric(
            &input[y * width..][..width],
            &mut scratch[y * width..][..width],
            kernel,
        );
    }

    // Vertical pass. Reflection only picks which row a tap reads, so every
    // output row — border rows included — is a whole-row vector accumulation.
    for y in 0..height {
        let target = &mut output[y * width..][..width];
        let first = reflect(y as isize - pad as isize, height);
        scale_into(target, &scratch[first * width..][..width], kernel[0]);
        for (tap, weight) in kernel.iter().enumerate().skip(1) {
            let source = reflect(y as isize + tap as isize - pad as isize, height);
            scale_add(target, &scratch[source * width..][..width], *weight);
        }
    }
}

/// `imfilter(input, ones(f,f)/f², 'symmetric', 'same')` followed by taking
/// every `factor`-th sample — the low-pass step both SSIM and MS-SSIM use
/// before dropping to the next scale.
pub(crate) fn downsample(
    input: &[f32],
    width: usize,
    height: usize,
    factor: usize,
) -> (Vec<f32>, usize, usize) {
    let kernel = super::gaussian::box_1d(factor);
    let mut filtered = vec![0f32; width * height];
    let mut scratch = vec![0f32; width * height];
    convolve_same_symmetric(input, &mut filtered, &mut scratch, width, height, &kernel);

    let new_width = width / factor;
    let new_height = height / factor;
    let mut output = vec![0f32; new_width * new_height];
    for y in 0..new_height {
        let source_row = y * factor * width;
        let target_row = y * new_width;
        for x in 0..new_width {
            output[target_row + x] = filtered[source_row + x * factor];
        }
    }
    (output, new_width, new_height)
}

/// [`downsample`] by exactly 2, written out rather than convolved.
///
/// Every pyramid step halves, and at `factor == 2` the box filter has two taps,
/// so each kept sample depends on four inputs. Evaluating those four directly
/// removes the two full-size intermediates the general path materialises and
/// leaves the arithmetic — including the order of the two 0.5 taps and the
/// column-0 reflection — identical to it.
///
/// Returns the new `(width, height)`; `output` must hold `w/2 * h/2` floats.
pub(crate) fn halve_into(
    input: &[f32],
    width: usize,
    height: usize,
    output: &mut [f32],
) -> (usize, usize) {
    let (new_width, new_height) = (width / 2, height / 2);
    for y in 0..new_height {
        // The vertical taps are rows `2y-1` and `2y`, the first folding about
        // row 0 when it goes negative.
        let top = &input[reflect(2 * y as isize - 1, height) * width..][..width];
        let bottom = &input[2 * y * width..][..width];
        let out = &mut output[y * new_width..][..new_width];

        // Column 0 folds about column 0; every other output column reads the
        // pair `(2x-1, 2x)`, which is what pairing off the row from index 1
        // walks — and pairing rather than indexing keeps the loop free of
        // bounds checks, so it vectorises.
        out[0] = (top[1] * 0.5 + top[0] * 0.5) * 0.5 + (bottom[1] * 0.5 + bottom[0] * 0.5) * 0.5;
        let pairs = top[1..].chunks_exact(2).zip(bottom[1..].chunks_exact(2));
        for (sample, (top, bottom)) in out[1..].iter_mut().zip(pairs) {
            *sample =
                (top[0] * 0.5 + top[1] * 0.5) * 0.5 + (bottom[0] * 0.5 + bottom[1] * 0.5) * 0.5;
        }
    }
    (new_width, new_height)
}

#[inline]
pub(crate) fn reflect(index: isize, len: usize) -> usize {
    let last = len as isize - 1;
    let folded = if index < 0 {
        -index
    } else if index > last {
        2 * last - index
    } else {
        index
    };
    folded.clamp(0, last) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Direct transcription of the JS reference loops, used as the oracle.
    fn reference_valid(input: &[f32], width: usize, height: usize, kernel: &[f32]) -> Vec<f32> {
        let k = kernel.len();
        let pad = k / 2;
        let mut temp = vec![0f32; width * height];
        for y in 0..height {
            for x in 0..width {
                let mut total = 0f32;
                for (tap, weight) in kernel.iter().enumerate() {
                    let sx = (x + tap).saturating_sub(pad).min(width - 1);
                    total += input[y * width + sx] * weight;
                }
                temp[y * width + x] = total;
            }
        }
        let out_width = width + 1 - k;
        let out_height = height + 1 - k;
        let mut out = vec![0f32; out_width * out_height];
        for y in 0..out_height {
            for x in 0..out_width {
                let mut total = 0f32;
                for (tap, weight) in kernel.iter().enumerate() {
                    total += temp[(y + tap) * width + x + pad] * weight;
                }
                out[y * out_width + x] = total;
            }
        }
        out
    }

    fn reference_symmetric(input: &[f32], width: usize, height: usize, kernel: &[f32]) -> Vec<f32> {
        let k = kernel.len();
        let pad = k / 2;
        let mut temp = vec![0f32; width * height];
        for y in 0..height {
            for x in 0..width {
                let mut total = 0f32;
                for (tap, weight) in kernel.iter().enumerate() {
                    let source = reflect(x as isize + tap as isize - pad as isize, width);
                    total += input[y * width + source] * weight;
                }
                temp[y * width + x] = total;
            }
        }
        let mut out = vec![0f32; width * height];
        for y in 0..height {
            for x in 0..width {
                let mut total = 0f32;
                for (tap, weight) in kernel.iter().enumerate() {
                    let source = reflect(y as isize + tap as isize - pad as isize, height);
                    total += temp[source * width + x] * weight;
                }
                out[y * width + x] = total;
            }
        }
        out
    }

    fn ramp(width: usize, height: usize) -> Vec<f32> {
        (0..width * height)
            .map(|i| ((i * 37) % 251) as f32)
            .collect()
    }

    #[test]
    fn valid_matches_the_reference_loops() {
        let (width, height) = (43, 29);
        let input = ramp(width, height);
        let kernel: Vec<f32> = (0..11).map(|i| (i + 1) as f32 / 66.0).collect();
        let mut out = vec![0f32; (width + 1 - 11) * (height + 1 - 11)];
        let mut scratch = vec![0f32; valid_scratch_len(width, height, 11)];
        convolve_valid(&input, &mut out, &mut scratch, width, height, &kernel);

        let expected = reference_valid(&input, width, height, &kernel);
        for (i, value) in out.iter().enumerate() {
            assert!((value - expected[i]).abs() < 1e-2, "index {i}");
        }
    }

    #[test]
    fn symmetric_matches_the_reference_loops() {
        for (width, height) in [(43usize, 29usize), (7, 5)] {
            let input = ramp(width, height);
            let kernel: Vec<f32> = (0..11).map(|i| (i + 1) as f32 / 66.0).collect();
            let mut out = vec![0f32; width * height];
            let mut scratch = vec![0f32; width * height];
            convolve_same_symmetric(&input, &mut out, &mut scratch, width, height, &kernel);

            let expected = reference_symmetric(&input, width, height, &kernel);
            for (i, value) in out.iter().enumerate() {
                assert!(
                    (value - expected[i]).abs() < 1e-2,
                    "{width}x{height} index {i}: {value} vs {}",
                    expected[i]
                );
            }
        }
    }

    #[test]
    fn symmetric_handles_the_two_tap_downsample_filter() {
        let (width, height) = (9, 6);
        let input = ramp(width, height);
        let kernel = [0.5f32, 0.5];
        let mut out = vec![0f32; width * height];
        let mut scratch = vec![0f32; width * height];
        convolve_same_symmetric(&input, &mut out, &mut scratch, width, height, &kernel);

        let expected = reference_symmetric(&input, width, height, &kernel);
        assert_eq!(out, expected);
    }

    /// The fused path is only allowed to exist because it is bit-identical to
    /// the general one — the pyramid's numbers depend on it.
    #[test]
    fn halving_matches_the_general_downsample_bit_for_bit() {
        for (width, height) in [(64usize, 48usize), (43, 29), (9, 6), (2, 2), (5, 3)] {
            let input = ramp(width, height);
            let (expected, expected_width, expected_height) = downsample(&input, width, height, 2);
            let mut output = vec![0f32; (width / 2) * (height / 2)];
            let (new_width, new_height) = halve_into(&input, width, height, &mut output);
            assert_eq!((new_width, new_height), (expected_width, expected_height));
            assert_eq!(output, expected, "{width}x{height}");
        }
    }

    #[test]
    fn reflection_folds_without_repeating_the_edge() {
        assert_eq!(reflect(-1, 8), 1);
        assert_eq!(reflect(-3, 8), 3);
        assert_eq!(reflect(0, 8), 0);
        assert_eq!(reflect(8, 8), 6);
        assert_eq!(reflect(9, 8), 5);
        assert_eq!(reflect(-99, 4), 3);
    }
}
