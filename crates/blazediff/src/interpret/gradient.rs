use crate::types::Image;

use super::types::{BoundingBox, GradientStats};

const EDGE_GRADIENT_THRESHOLD_SQ: f32 = 30.0 * 30.0;

#[inline(always)]
fn luminance(pixel: u32) -> f32 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    0.299 * r + 0.587 * g + 0.114 * b
}

/// Compute edge/gradient statistics for both images at the change region.
///
/// Returns edge_score (img1), edge_score_img2 (img2), and edge_correlation
/// (fraction of masked pixels where both images agree on edge/non-edge).
pub fn compute_gradient_stats(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
    height: u32,
) -> GradientStats {
    // Guard: Sobel gradients need at least 2px in each dimension for neighbor lookups.
    // Degenerate regions return safe defaults (no edges, perfect correlation).
    if width < 2 || height < 2 || bbox.width < 1 || bbox.height < 1 {
        return GradientStats {
            edge_score: 0.0,
            edge_score_img2: 0.0,
            edge_correlation: 1.0,
        };
    }

    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();
    let bw = bbox.width as usize;
    let bh = bbox.height as usize;

    // Pre-compute luminance buffers for both images.
    let mut lum1 = vec![0.0f32; bw * bh];
    let mut lum2 = vec![0.0f32; bw * bh];
    for dy in 0..bh {
        let y = bbox.y as usize + dy;
        let row_base = y * width as usize;
        let buf_base = dy * bw;
        for dx in 0..bw {
            let x = bbox.x as usize + dx;
            let idx = row_base + x;
            lum1[buf_base + dx] = luminance(pixels1[idx]);
            lum2[buf_base + dx] = luminance(pixels2[idx]);
        }
    }

    let mut edge_count_1: u32 = 0;
    let mut edge_count_2: u32 = 0;
    let mut agree_count: u32 = 0;
    let mut total_count: u32 = 0;
    let w = width as usize;

    for dy in 0..bh {
        let y = bbox.y as usize + dy;
        for dx in 0..bw {
            let x = bbox.x as usize + dx;
            let idx = y * w + x;
            if !mask[idx] {
                continue;
            }
            total_count += 1;

            let is_edge_1 = is_edge_pixel(&lum1, pixels1, bw, dx, dy, x, y, w, width, height, bbox);
            let is_edge_2 = is_edge_pixel(&lum2, pixels2, bw, dx, dy, x, y, w, width, height, bbox);

            if is_edge_1 {
                edge_count_1 += 1;
            }
            if is_edge_2 {
                edge_count_2 += 1;
            }
            if is_edge_1 == is_edge_2 {
                agree_count += 1;
            }
        }
    }

    if total_count == 0 {
        return GradientStats {
            edge_score: 0.0,
            edge_score_img2: 0.0,
            edge_correlation: 1.0,
        };
    }

    GradientStats {
        edge_score: edge_count_1 as f32 / total_count as f32,
        edge_score_img2: edge_count_2 as f32 / total_count as f32,
        edge_correlation: agree_count as f32 / total_count as f32,
    }
}

/// Check if a pixel is an edge pixel based on Sobel gradient magnitude.
#[inline(always)]
fn is_edge_pixel(
    lum: &[f32],
    pixels: &[u32],
    bw: usize,
    dx: usize,
    dy: usize,
    x: usize,
    y: usize,
    w: usize,
    width: u32,
    height: u32,
    bbox: &BoundingBox,
) -> bool {
    let center_lum = lum[dy * bw + dx];

    let gx = if x == 0 {
        lum_at(lum, bw, dx + 1, dy, pixels, x + 1, y, w, bbox) - center_lum
    } else if x >= width as usize - 1 {
        center_lum - lum_at(lum, bw, dx.wrapping_sub(1), dy, pixels, x - 1, y, w, bbox)
    } else {
        (lum_at(lum, bw, dx + 1, dy, pixels, x + 1, y, w, bbox)
            - lum_at(lum, bw, dx.wrapping_sub(1), dy, pixels, x - 1, y, w, bbox))
            * 0.5
    };

    let gy = if y == 0 {
        lum_at(lum, bw, dx, dy + 1, pixels, x, y + 1, w, bbox) - center_lum
    } else if y >= height as usize - 1 {
        center_lum - lum_at(lum, bw, dx, dy.wrapping_sub(1), pixels, x, y - 1, w, bbox)
    } else {
        (lum_at(lum, bw, dx, dy + 1, pixels, x, y + 1, w, bbox)
            - lum_at(lum, bw, dx, dy.wrapping_sub(1), pixels, x, y - 1, w, bbox))
            * 0.5
    };

    gx * gx + gy * gy >= EDGE_GRADIENT_THRESHOLD_SQ
}

/// Fetch luminance from the pre-computed buffer if the coordinate is inside the bbox,
/// otherwise compute it directly from the pixel data.
#[inline(always)]
fn lum_at(
    buf: &[f32],
    bw: usize,
    dx: usize,
    dy: usize,
    pixels: &[u32],
    abs_x: usize,
    abs_y: usize,
    img_width: usize,
    bbox: &BoundingBox,
) -> f32 {
    if dx < bw && dy < (bbox.height as usize) {
        buf[dy * bw + dx]
    } else {
        luminance(pixels[abs_y * img_width + abs_x])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::test_helpers::*;

    #[test]
    fn test_flat_image_zero_edge_score() {
        let width = 20;
        let height = 20;
        let img = make_solid_image(width, height, 128, 128, 128);
        let img2 = make_solid_image(width, height, 128, 128, 128);
        let mask = vec![true; (width * height) as usize];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_gradient_stats(&img, &img2, &mask, &bbox, width, height);

        assert!(stats.edge_score < 0.01);
        assert!(stats.edge_score_img2 < 0.01);
        assert!(stats.edge_correlation > 0.99);
    }

    #[test]
    fn test_sharp_edge_high_score() {
        let width = 20;
        let height = 20;
        // Left half black, right half white — sharp vertical edge at x=10
        let mut img = make_solid_image(width, height, 0, 0, 0);
        for y in 0..height {
            for x in 10..width {
                let pos = ((y * width + x) * 4) as usize;
                img.data[pos] = 255;
                img.data[pos + 1] = 255;
                img.data[pos + 2] = 255;
                img.data[pos + 3] = 255;
            }
        }
        let img2 = make_solid_image(width, height, 128, 128, 128);

        // Mark only the pixels near the edge as changed
        let mut mask = vec![false; (width * height) as usize];
        for y in 0..height {
            for x in 9..12 {
                mask[(y * width + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 9,
            y: 0,
            width: 3,
            height,
        };
        let stats = compute_gradient_stats(&img, &img2, &mask, &bbox, width, height);

        assert!(stats.edge_score > 0.3);
        // img2 is flat, so its edge score should be low
        assert!(stats.edge_score_img2 < 0.01);
        // Disagreement: img1 has edges, img2 doesn't
        assert!(stats.edge_correlation < 0.7);
    }

    #[test]
    fn test_both_images_same_edges() {
        let width = 20;
        let height = 20;
        // Both images have the same sharp edge
        let mut img1 = make_solid_image(width, height, 0, 0, 0);
        let mut img2 = make_solid_image(width, height, 0, 0, 0);
        for y in 0..height {
            for x in 10..width {
                let pos = ((y * width + x) * 4) as usize;
                img1.data[pos] = 255;
                img1.data[pos + 1] = 255;
                img1.data[pos + 2] = 255;
                // img2: same edge but different color
                img2.data[pos] = 200;
                img2.data[pos + 1] = 200;
                img2.data[pos + 2] = 200;
            }
        }

        let mut mask = vec![false; (width * height) as usize];
        for y in 0..height {
            for x in 9..12 {
                mask[(y * width + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 9,
            y: 0,
            width: 3,
            height,
        };
        let stats = compute_gradient_stats(&img1, &img2, &mask, &bbox, width, height);

        assert!(stats.edge_score > 0.3);
        assert!(stats.edge_score_img2 > 0.3);
        assert!(
            stats.edge_correlation > 0.9,
            "Same edge structure → high correlation"
        );
    }

    #[test]
    fn test_identical_images_correlation_is_one() {
        let width = 20;
        let height = 20;
        let mut img = make_solid_image(width, height, 0, 0, 0);
        for y in 0..height {
            for x in 10..width {
                let pos = ((y * width + x) * 4) as usize;
                img.data[pos] = 255;
                img.data[pos + 1] = 255;
                img.data[pos + 2] = 255;
            }
        }
        // Same image for both → perfect correlation
        let mask = vec![true; (width * height) as usize];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_gradient_stats(&img, &img, &mask, &bbox, width, height);

        assert!(
            (stats.edge_correlation - 1.0).abs() < 0.001,
            "Identical images → correlation=1.0, got {}",
            stats.edge_correlation
        );
        assert!(
            (stats.edge_score - stats.edge_score_img2).abs() < 0.001,
            "Same image → same edge scores"
        );
    }

    #[test]
    fn test_correlation_bounds() {
        // Verify edge_correlation is always in [0, 1] regardless of input
        let width = 20;
        let height = 20;
        let mut img1 = make_solid_image(width, height, 0, 0, 0);
        let mut img2 = make_solid_image(width, height, 255, 255, 255);
        // img1: left half black, right half white
        for y in 0..height {
            for x in 10..width {
                let pos = ((y * width + x) * 4) as usize;
                img1.data[pos] = 255;
                img1.data[pos + 1] = 255;
                img1.data[pos + 2] = 255;
            }
        }
        // img2: top half black, bottom half white (orthogonal edges)
        for y in 10..height {
            for x in 0..width {
                let pos = ((y * width + x) * 4) as usize;
                img2.data[pos] = 255;
                img2.data[pos + 1] = 255;
                img2.data[pos + 2] = 255;
            }
        }

        let mask = vec![true; (width * height) as usize];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_gradient_stats(&img1, &img2, &mask, &bbox, width, height);

        assert!(
            stats.edge_correlation >= 0.0 && stats.edge_correlation <= 1.0,
            "Correlation out of bounds: {}",
            stats.edge_correlation
        );
        assert!(stats.edge_score >= 0.0 && stats.edge_score <= 1.0);
        assert!(stats.edge_score_img2 >= 0.0 && stats.edge_score_img2 <= 1.0);
    }

    #[test]
    fn test_single_pixel_region_no_panic() {
        let width = 10;
        let height = 10;
        let img1 = make_solid_image(width, height, 128, 128, 128);
        let img2 = make_solid_image(width, height, 200, 200, 200);
        let mut mask = vec![false; (width * height) as usize];
        mask[55] = true; // single pixel at (5, 5)

        let bbox = BoundingBox {
            x: 5,
            y: 5,
            width: 1,
            height: 1,
        };
        let stats = compute_gradient_stats(&img1, &img2, &mask, &bbox, width, height);

        // Should not panic, should return valid values
        assert!(stats.edge_correlation >= 0.0 && stats.edge_correlation <= 1.0);
    }

    #[test]
    fn test_empty_mask_returns_defaults() {
        let width = 10;
        let height = 10;
        let img1 = make_solid_image(width, height, 128, 128, 128);
        let img2 = make_solid_image(width, height, 200, 200, 200);
        let mask = vec![false; (width * height) as usize]; // nothing masked

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_gradient_stats(&img1, &img2, &mask, &bbox, width, height);

        assert_eq!(stats.edge_score, 0.0);
        assert_eq!(stats.edge_score_img2, 0.0);
        assert_eq!(stats.edge_correlation, 1.0); // default for empty
    }

    #[test]
    fn test_boundary_pixels() {
        let width = 5;
        let height = 5;
        let img = make_solid_image(width, height, 128, 128, 128);
        let img2 = make_solid_image(width, height, 128, 128, 128);

        let mut mask = vec![false; (width * height) as usize];
        mask[0] = true;
        mask[(width - 1) as usize] = true;
        mask[((height - 1) * width) as usize] = true;
        mask[((height - 1) * width + width - 1) as usize] = true;

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_gradient_stats(&img, &img2, &mask, &bbox, width, height);

        assert!(stats.edge_score < 0.01);
    }
}
