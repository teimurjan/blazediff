use blazediff_shared::yiq::{YIQ_I, YIQ_Q, YIQ_Y};
use blazediff_shared::Image;

use super::types::{BoundingBox, ChromaStats};

#[inline(always)]
fn yiq(pixel: u32) -> (f32, f32, f32) {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    let y = YIQ_Y[0] as f32 * r + YIQ_Y[1] as f32 * g + YIQ_Y[2] as f32 * b;
    let i = YIQ_I[0] as f32 * r + YIQ_I[1] as f32 * g + YIQ_I[2] as f32 * b;
    let q = YIQ_Q[0] as f32 * r + YIQ_Q[1] as f32 * g + YIQ_Q[2] as f32 * b;
    (y, i, q)
}

/// Chroma-plane statistics of the changed pixels inside `bbox`.
///
/// These separate *recolors* from *content replacements* on photographic
/// edits where pixel-level luminance correlation saturates: a recolor moves
/// chroma coherently (one hue rotation, smooth delta field, chroma dominating
/// the luminance delta), while a replacement scatters it.
pub fn compute_chroma_stats(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
) -> ChromaStats {
    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();

    let mut sum_abs_dy = 0.0f64;
    let mut sum_dy = 0.0f64;
    let mut sum_abs_di = 0.0f64;
    let mut sum_abs_dq = 0.0f64;
    let mut sum_abs_dc = 0.0f64;
    let mut sum_abs_dc_sq = 0.0f64;
    let mut dot = 0.0f64;
    let mut mag = 0.0f64;
    let mut sum_sat1 = 0.0f64;
    let mut sum_sat2 = 0.0f64;
    let mut count = 0u32;

    // Roughness accumulators: |Δc| differences between 4-adjacent masked pixels.
    let mut rough_sum = 0.0f64;
    let mut rough_count = 0u32;
    // |Δc| of the previous masked pixel in the current row, if adjacent.
    let bw = bbox.width as usize;
    let mut prev_row: Vec<f32> = vec![f32::NAN; bw];

    for y in bbox.y..bbox.y + bbox.height {
        let mut prev_in_row = f32::NAN;
        for x in bbox.x..bbox.x + bbox.width {
            let dx = (x - bbox.x) as usize;
            let idx = (y * width + x) as usize;
            if !mask[idx] {
                prev_in_row = f32::NAN;
                prev_row[dx] = f32::NAN;
                continue;
            }
            let (y1, i1, q1) = yiq(pixels1[idx]);
            let (y2, i2, q2) = yiq(pixels2[idx]);
            let dy = y2 - y1;
            let di = i2 - i1;
            let dq = q2 - q1;
            let dc = (di * di + dq * dq).sqrt();
            let sat1 = (i1 * i1 + q1 * q1).sqrt();
            let sat2 = (i2 * i2 + q2 * q2).sqrt();

            sum_abs_dy += dy.abs() as f64;
            sum_dy += dy as f64;
            sum_abs_di += di.abs() as f64;
            sum_abs_dq += dq.abs() as f64;
            sum_abs_dc += dc as f64;
            sum_abs_dc_sq += (dc as f64) * (dc as f64);
            dot += (i1 * i2 + q1 * q2) as f64;
            mag += (sat1 * sat2) as f64;
            sum_sat1 += sat1 as f64;
            sum_sat2 += sat2 as f64;
            count += 1;

            if !prev_in_row.is_nan() {
                rough_sum += (dc - prev_in_row).abs() as f64;
                rough_count += 1;
            }
            if !prev_row[dx].is_nan() {
                rough_sum += (dc - prev_row[dx]).abs() as f64;
                rough_count += 1;
            }
            prev_in_row = dc;
            prev_row[dx] = dc;
        }
    }

    if count == 0 {
        return ChromaStats {
            mean_abs_dy: 0.0,
            mean_dy: 0.0,
            mean_abs_di: 0.0,
            mean_abs_dq: 0.0,
            mean_abs_dc: 0.0,
            chroma_cos: 1.0,
            sat1: 0.0,
            sat2: 0.0,
            chroma_rough: 0.0,
        };
    }

    let n = count as f64;
    let mean_dc = sum_abs_dc / n;
    let var_dc = (sum_abs_dc_sq / n - mean_dc * mean_dc).max(0.0);
    let std_dc = var_dc.sqrt();
    let rough = if rough_count > 0 {
        (rough_sum / rough_count as f64) / (std_dc + 1e-6)
    } else {
        0.0
    };

    ChromaStats {
        mean_abs_dy: (sum_abs_dy / n / 255.0) as f32,
        mean_dy: (sum_dy / n / 255.0) as f32,
        mean_abs_di: (sum_abs_di / n / 255.0) as f32,
        mean_abs_dq: (sum_abs_dq / n / 255.0) as f32,
        mean_abs_dc: (sum_abs_dc / n / 255.0) as f32,
        chroma_cos: if mag > 1e-6 {
            (dot / mag).clamp(-1.0, 1.0) as f32
        } else {
            1.0
        },
        sat1: (sum_sat1 / n / 255.0) as f32,
        sat2: (sum_sat2 / n / 255.0) as f32,
        chroma_rough: rough as f32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::*;

    fn full_mask_bbox(w: u32, h: u32) -> (Vec<bool>, BoundingBox) {
        (
            vec![true; (w * h) as usize],
            BoundingBox {
                x: 0,
                y: 0,
                width: w,
                height: h,
            },
        )
    }

    #[test]
    fn uniform_recolor_has_coherent_smooth_chroma() {
        // Solid red block becomes solid blue: one coherent chroma rotation,
        // perfectly smooth delta field.
        let img1 = make_solid_image(16, 16, 200, 40, 40);
        let img2 = make_solid_image(16, 16, 40, 40, 200);
        let (mask, bbox) = full_mask_bbox(16, 16);
        let stats = compute_chroma_stats(&img1, &img2, &mask, &bbox, 16);

        assert!(
            stats.chroma_cos < 0.0,
            "red→blue should rotate chroma, cos={}",
            stats.chroma_cos
        );
        assert!(
            stats.chroma_rough < 0.1,
            "uniform recolor is smooth, rough={}",
            stats.chroma_rough
        );
        assert!(stats.mean_abs_dc > 0.1);
    }

    #[test]
    fn identical_images_have_zero_deltas() {
        let img = make_solid_image(8, 8, 100, 150, 200);
        let (mask, bbox) = full_mask_bbox(8, 8);
        let stats = compute_chroma_stats(&img, &img, &mask, &bbox, 8);
        assert_eq!(stats.mean_abs_dy, 0.0);
        assert_eq!(stats.mean_abs_dc, 0.0);
        assert!(stats.chroma_cos > 0.99);
    }

    #[test]
    fn scattered_replacement_has_rough_chroma_delta() {
        // Alternating unrelated colors: chroma delta magnitude varies pixel to
        // pixel, so roughness (gradient over std) is high.
        let img1 = make_solid_image(16, 16, 128, 128, 128);
        let mut img2 = make_solid_image(16, 16, 128, 128, 128);
        for y in 0..16u32 {
            for x in 0..16u32 {
                let c: (u8, u8, u8) = match (x + y * 3) % 4 {
                    0 => (220, 30, 30),
                    1 => (128, 128, 128),
                    2 => (30, 220, 30),
                    _ => (30, 30, 220),
                };
                set_pixel(&mut img2, x, y, c.0, c.1, c.2);
            }
        }
        let (mask, bbox) = full_mask_bbox(16, 16);
        let stats = compute_chroma_stats(&img1, &img2, &mask, &bbox, 16);
        assert!(
            stats.chroma_rough > 0.5,
            "patchy replacement should be rough, got {}",
            stats.chroma_rough
        );
    }

    #[test]
    fn empty_mask_returns_neutral_stats() {
        let img = make_solid_image(8, 8, 10, 20, 30);
        let mask = vec![false; 64];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 8,
            height: 8,
        };
        let stats = compute_chroma_stats(&img, &img, &mask, &bbox, 8);
        assert_eq!(stats.mean_abs_dc, 0.0);
        assert_eq!(stats.chroma_cos, 1.0);
    }
}
