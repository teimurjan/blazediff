use crate::types::Image;
use crate::yiq::{color_delta_f32, MAX_YIQ_DELTA_F32};

use super::types::{BoundingBox, ColorDeltaStats};

pub fn compute_color_delta(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
) -> ColorDeltaStats {
    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();

    let mut sum: f64 = 0.0;
    let mut sum_sq: f64 = 0.0;
    let mut max: f32 = 0.0;
    let mut count: u32 = 0;

    for dy in 0..bbox.height {
        let y = bbox.y + dy;
        for dx in 0..bbox.width {
            let x = bbox.x + dx;
            let idx = (y * width + x) as usize;
            if !mask[idx] {
                continue;
            }

            let delta = color_delta_f32(pixels1[idx], pixels2[idx]).abs();
            let normalized = delta as f64 / MAX_YIQ_DELTA_F32 as f64;
            sum += normalized;
            sum_sq += normalized * normalized;
            if delta > max {
                max = delta;
            }
            count += 1;
        }
    }

    if count == 0 {
        return ColorDeltaStats {
            mean_delta: 0.0,
            max_delta: 0.0,
            delta_stddev: 0.0,
        };
    }

    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64 - mean * mean).max(0.0);

    ColorDeltaStats {
        mean_delta: mean as f32,
        max_delta: max / MAX_YIQ_DELTA_F32,
        delta_stddev: variance.sqrt() as f32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::test_helpers::*;

    #[test]
    fn test_solid_block_high_delta() {
        let width = 10;
        let img1 = make_solid_image(width, 10, 0, 0, 0);
        let mut img2 = make_solid_image(width, 10, 0, 0, 0);
        fill_block(&mut img2, 2, 2, 5, 5, 255, 255, 255);

        let mut mask = vec![false; 100];
        for dy in 0..5u32 {
            for dx in 0..5u32 {
                mask[((2 + dy) * width + (2 + dx)) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 2,
            y: 2,
            width: 5,
            height: 5,
        };
        let stats = compute_color_delta(&img1, &img2, &mask, &bbox, width);

        assert!(stats.mean_delta > 0.5);
        assert!(stats.max_delta > 0.5);
        // Uniform change → low stddev
        assert!(stats.delta_stddev < 0.01);
    }

    #[test]
    fn test_identical_colors_zero_delta() {
        let width = 10;
        let img1 = make_solid_image(width, 10, 128, 128, 128);
        let img2 = make_solid_image(width, 10, 128, 128, 128);

        let mask = vec![true; 100];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let stats = compute_color_delta(&img1, &img2, &mask, &bbox, width);

        assert!((stats.mean_delta).abs() < f32::EPSILON);
        assert!((stats.max_delta).abs() < f32::EPSILON);
        assert!((stats.delta_stddev).abs() < f32::EPSILON);
    }

    #[test]
    fn test_subtle_change_low_delta() {
        let width = 10;
        let img1 = make_solid_image(width, 10, 128, 128, 128);
        let mut img2 = make_solid_image(width, 10, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 10, 10, 135, 135, 135);

        let mask = vec![true; 100];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let stats = compute_color_delta(&img1, &img2, &mask, &bbox, width);

        assert!(stats.mean_delta > 0.0);
        assert!(stats.mean_delta < 0.05);
        // Uniform subtle change → low stddev
        assert!(stats.delta_stddev < 0.01);
    }

    #[test]
    fn test_patchy_change_high_stddev() {
        let width = 10;
        let img1 = make_solid_image(width, 10, 128, 128, 128);
        let mut img2 = make_solid_image(width, 10, 128, 128, 128);
        // Half the region changes a lot, half stays similar
        fill_block(&mut img2, 0, 0, 5, 10, 255, 0, 0);
        fill_block(&mut img2, 5, 0, 5, 10, 130, 130, 130);

        let mask = vec![true; 100];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let stats = compute_color_delta(&img1, &img2, &mask, &bbox, width);

        // Patchy → high stddev
        assert!(
            stats.delta_stddev > 0.1,
            "Expected high stddev for patchy change, got {}",
            stats.delta_stddev
        );
    }
}
