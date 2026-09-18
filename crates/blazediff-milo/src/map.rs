//! Rendering the per-pixel error map into an RGBA visualization.

/// Paint `map`, one value per pixel of a `width` x `height` image, over an
/// RGBA8 `output` buffer as an opaque grayscale image, bright where the
/// perceived error is high. Values are clamped to `0..=1`, the range the
/// reference's own colormap render assumes.
///
/// A no-op when `map` or `output` is too short for `width * height`.
pub fn render_map(output: &mut [u8], width: usize, height: usize, map: &[f32]) {
    let pixels = width * height;
    if map.len() < pixels || output.len() < pixels * 4 {
        return;
    }
    for (pixel, value) in output.chunks_exact_mut(4).zip(map) {
        let gray = (value.clamp(0.0, 1.0) * 255.0) as u8;
        pixel[0] = gray;
        pixel[1] = gray;
        pixel[2] = gray;
        pixel[3] = 255;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_error_paints_opaque_black() {
        let mut output = vec![7u8; 2 * 2 * 4];
        render_map(&mut output, 2, 2, &[0.0; 4]);
        for pixel in output.chunks_exact(4) {
            assert_eq!(pixel, [0, 0, 0, 255]);
        }
    }

    #[test]
    fn out_of_range_values_are_clamped() {
        let mut output = vec![0u8; 2 * 4];
        render_map(&mut output, 2, 1, &[-3.0, 7.0]);
        assert_eq!(&output[..4], &[0, 0, 0, 255]);
        assert_eq!(&output[4..], &[255, 255, 255, 255]);
    }

    #[test]
    fn a_short_map_leaves_the_output_alone() {
        let mut output = vec![9u8; 2 * 4];
        render_map(&mut output, 2, 1, &[0.5]);
        assert!(output.iter().all(|byte| *byte == 9));
    }
}
