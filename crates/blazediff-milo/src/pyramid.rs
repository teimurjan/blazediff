//! The image pyramid and the mask's way back up it.
//!
//! Each op mirrors the PyTorch call in the reference `mask_generator`, down to
//! the order the operands are summed in: `avg_pool2d(kernel_size=2, stride=2)`,
//! `interpolate(scale_factor=2, mode="bilinear", align_corners=True)` and the
//! one-row / one-column replicate pad that squares an odd size back up.

/// `u8 / 255` RGB, NHWC, alpha dropped: what `transforms.ToTensor()` makes of
/// `Image.convert("RGB")`.
pub(crate) fn rgb_from_rgba8(rgba: &[u8], pixels: usize) -> Vec<f32> {
    let mut rgb = Vec::with_capacity(pixels * 3);
    for pixel in rgba[..pixels * 4].chunks_exact(4) {
        rgb.extend(pixel[..3].iter().map(|&v| v as f32 / 255.0));
    }
    rgb
}

/// Two-by-two average pooling with stride two over an NHWC plane of
/// `channels`, a trailing odd row or column dropped. Returns the plane and its
/// `(width, height)`.
pub(crate) fn avg_pool_2x2(
    src: &[f32],
    width: usize,
    height: usize,
    channels: usize,
) -> (Vec<f32>, usize, usize) {
    let (out_w, out_h) = (width / 2, height / 2);
    let mut out = Vec::with_capacity(out_w * out_h * channels);
    for y in 0..out_h {
        let top = &src[(2 * y) * width * channels..][..width * channels];
        let bottom = &src[(2 * y + 1) * width * channels..][..width * channels];
        for x in 0..out_w {
            let left = 2 * x * channels;
            let right = left + channels;
            for c in 0..channels {
                // avg_pool2d sums rows then columns, then divides.
                let sum = ((top[left + c] + top[right + c]) + bottom[left + c]) + bottom[right + c];
                out.push(sum / 4.0);
            }
        }
    }
    (out, out_w, out_h)
}

/// Where a doubled axis samples from: source indices and their weights, per
/// destination index, per `compute_source_index_and_lambda` with
/// `align_corners=True`. Destination indices past `2 * src` replicate the
/// last one, which is the pad.
fn axis_taps(src: usize, dst: usize) -> Vec<(usize, usize, f32, f32)> {
    let doubled = 2 * src;
    debug_assert!(dst == doubled || dst == doubled + 1);
    let scale = (src as f32 - 1.0) / (doubled as f32 - 1.0);
    (0..dst)
        .map(|i| {
            let real = scale * i.min(doubled - 1) as f32;
            let i0 = (real as usize).min(src - 1);
            let i1 = i0 + usize::from(i0 < src - 1);
            let lambda1 = (real - i0 as f32).clamp(0.0, 1.0);
            (i0, i1, 1.0 - lambda1, lambda1)
        })
        .collect()
}

/// Bilinear x2 upsample of a single-channel plane with `align_corners=True`,
/// replicate-padded by one row and/or column when `(dst_w, dst_h)` is odd.
pub(crate) fn upsample_2x(
    src: &[f32],
    src_w: usize,
    src_h: usize,
    dst_w: usize,
    dst_h: usize,
) -> Vec<f32> {
    let columns = axis_taps(src_w, dst_w);
    let rows = axis_taps(src_h, dst_h);
    let mut out = Vec::with_capacity(dst_w * dst_h);
    for &(y0, y1, h0, h1) in &rows {
        let above = &src[y0 * src_w..][..src_w];
        let below = &src[y1 * src_w..][..src_w];
        for &(x0, x1, w0, w1) in &columns {
            // The generic Nd kernel interpolates along W inside H.
            let top = above[x0] * w0 + above[x1] * w1;
            let bottom = below[x0] * w0 + below[x1] * w1;
            out.push(top * h0 + bottom * h1);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgb_drops_alpha_and_scales_by_255() {
        let rgb = rgb_from_rgba8(&[255, 0, 51, 7, 0, 128, 255, 0], 2);
        assert_eq!(rgb, [1.0, 0.0, 0.2, 0.0, 128.0 / 255.0, 1.0]);
    }

    #[test]
    fn pooling_averages_each_2x2_and_drops_the_odd_edge() {
        // 3x3 single channel, row-major 1..=9.
        let src: Vec<f32> = (1..=9).map(|v| v as f32).collect();
        let (out, w, h) = avg_pool_2x2(&src, 3, 3, 1);
        assert_eq!((w, h), (1, 1));
        assert_eq!(out, [(1.0 + 2.0 + 4.0 + 5.0) / 4.0]);
    }

    #[test]
    fn upsampling_keeps_the_corners_and_interpolates_between() {
        // align_corners=True: the first and last outputs are the first and
        // last inputs; a 2 -> 4 axis samples at 0, 1/3, 2/3, 1.
        let out = upsample_2x(&[0.0, 3.0], 2, 1, 4, 2);
        assert_eq!(out.len(), 8);
        let row = &out[..4];
        assert_eq!(row[0], 0.0);
        assert!((row[1] - 1.0).abs() < 1e-6);
        assert!((row[2] - 2.0).abs() < 1e-6);
        assert_eq!(row[3], 3.0);
        assert_eq!(&out[4..], row);
    }

    #[test]
    fn an_odd_target_replicates_the_last_row_and_column() {
        let out = upsample_2x(&[1.0, 2.0, 3.0, 4.0], 2, 2, 5, 5);
        assert_eq!(out.len(), 25);
        for y in 0..5 {
            assert_eq!(out[y * 5 + 4], out[y * 5 + 3]);
        }
        assert_eq!(&out[20..25], &out[15..20]);
    }

    #[test]
    fn a_one_pixel_source_broadcasts() {
        assert_eq!(upsample_2x(&[0.5], 1, 1, 2, 2), [0.5; 4]);
    }
}
