//! Rendering a local similarity map into an RGBA visualization.

/// Paint `map` over an RGBA8 `output` buffer as an opaque grayscale image, dark
/// where the local score is low.
///
/// The map is smaller than the image — convolution crops it, and the metrics
/// may have downsampled first — so samples are stretched back with
/// nearest-neighbour lookup, matching `@blazediff/ssim`.
///
/// A no-op when the map is empty or `output` is too short to hold
/// `width * height` RGBA pixels.
pub fn render_map(
    output: &mut [u8],
    width: usize,
    height: usize,
    map: &[f32],
    map_width: usize,
    map_height: usize,
) {
    if map_width == 0 || map_height == 0 || output.len() < width * height * 4 {
        return;
    }

    let columns: Vec<usize> = (0..width)
        .map(|x| (x * map_width / width).min(map_width - 1))
        .collect();

    for y in 0..height {
        let row = (y * map_height / height).min(map_height - 1) * map_width;
        let target = &mut output[y * width * 4..][..width * 4];
        for (x, pixel) in target.chunks_exact_mut(4).enumerate() {
            let gray = (map[row + columns[x]].clamp(0.0, 1.0) * 255.0) as u8;
            pixel[0] = gray;
            pixel[1] = gray;
            pixel[2] = gray;
            pixel[3] = 255;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_perfect_map_paints_opaque_white() {
        let mut output = vec![0u8; 4 * 2 * 4];
        render_map(&mut output, 4, 2, &[1.0; 8], 4, 2);
        assert!(output.iter().all(|byte| *byte == 255));
    }

    #[test]
    fn out_of_range_scores_are_clamped() {
        let mut output = vec![0u8; 2 * 4];
        render_map(&mut output, 2, 1, &[-3.0, 7.0], 2, 1);
        assert_eq!(&output[..4], &[0, 0, 0, 255]);
        assert_eq!(&output[4..], &[255, 255, 255, 255]);
    }

    #[test]
    fn smaller_maps_are_stretched_over_the_image() {
        let mut output = vec![0u8; 4 * 4 * 4];
        render_map(&mut output, 4, 4, &[0.0, 1.0, 1.0, 0.0], 2, 2);
        // Each map sample covers a 2x2 block of the output.
        let red_at = |x: usize, y: usize| output[(y * 4 + x) * 4];
        for (x, y, expected) in [
            (0, 0, 0u8),
            (1, 1, 0),
            (2, 0, 255),
            (3, 1, 255),
            (0, 2, 255),
            (1, 3, 255),
            (2, 2, 0),
            (3, 3, 0),
        ] {
            assert_eq!(red_at(x, y), expected, "at ({x}, {y})");
        }
    }

    #[test]
    fn a_short_buffer_is_left_alone() {
        let mut output = vec![7u8; 4];
        render_map(&mut output, 4, 4, &[1.0; 4], 2, 2);
        assert!(output.iter().all(|byte| *byte == 7));
    }
}
