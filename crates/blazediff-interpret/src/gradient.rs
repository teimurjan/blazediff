use blazediff::Image;

use crate::types::{BoundingBox, GradientStats};

const EDGE_GRADIENT_THRESHOLD_SQ: f32 = 30.0 * 30.0;

#[inline(always)]
fn luminance(pixel: u32) -> f32 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    0.299 * r + 0.587 * g + 0.114 * b
}

pub fn compute_gradient_stats(
    img1: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
    height: u32,
) -> GradientStats {
    let pixels = img1.as_u32();
    let bw = bbox.width as usize;
    let bh = bbox.height as usize;

    // Pre-compute luminance buffer to avoid redundant per-neighbor recalculations.
    // Each pixel's luminance is used up to 5 times (center + 4 neighbors).
    let mut lum = vec![0.0f32; bw * bh];
    for dy in 0..bh {
        let y = bbox.y as usize + dy;
        let row_base = y * width as usize;
        let buf_base = dy * bw;
        for dx in 0..bw {
            let x = bbox.x as usize + dx;
            lum[buf_base + dx] = luminance(pixels[row_base + x]);
        }
    }

    let mut edge_count: u32 = 0;
    let mut total_count: u32 = 0;
    let w = width as usize;

    for dy in 0..bh {
        let y = bbox.y as usize + dy;
        let buf_row = dy * bw;
        for dx in 0..bw {
            let x = bbox.x as usize + dx;
            let idx = y * w + x;
            if !mask[idx] {
                continue;
            }
            total_count += 1;

            let center_lum = lum[buf_row + dx];

            // Horizontal gradient — use buffer when neighbor is inside bbox, else compute
            let gx = if x == 0 {
                lum_at(&lum, bw, dx + 1, dy, pixels, x + 1, y, w, bbox) - center_lum
            } else if x >= width as usize - 1 {
                center_lum - lum_at(&lum, bw, dx.wrapping_sub(1), dy, pixels, x - 1, y, w, bbox)
            } else {
                (lum_at(&lum, bw, dx + 1, dy, pixels, x + 1, y, w, bbox)
                    - lum_at(&lum, bw, dx.wrapping_sub(1), dy, pixels, x - 1, y, w, bbox))
                    * 0.5
            };

            // Vertical gradient
            let gy = if y == 0 {
                lum_at(&lum, bw, dx, dy + 1, pixels, x, y + 1, w, bbox) - center_lum
            } else if y >= height as usize - 1 {
                center_lum - lum_at(&lum, bw, dx, dy.wrapping_sub(1), pixels, x, y - 1, w, bbox)
            } else {
                (lum_at(&lum, bw, dx, dy + 1, pixels, x, y + 1, w, bbox)
                    - lum_at(&lum, bw, dx, dy.wrapping_sub(1), pixels, x, y - 1, w, bbox))
                    * 0.5
            };

            // Compare squared magnitude — avoids per-pixel sqrt
            let magnitude_sq = gx * gx + gy * gy;
            if magnitude_sq >= EDGE_GRADIENT_THRESHOLD_SQ {
                edge_count += 1;
            }
        }
    }

    if total_count == 0 {
        return GradientStats { edge_score: 0.0 };
    }

    GradientStats {
        edge_score: edge_count as f32 / total_count as f32,
    }
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
    use crate::test_helpers::*;

    #[test]
    fn test_flat_image_zero_edge_score() {
        let width = 20;
        let height = 20;
        let img = make_solid_image(width, height, 128, 128, 128);
        let mask = vec![true; (width * height) as usize];
        let bbox = BoundingBox { x: 0, y: 0, width, height };
        let stats = compute_gradient_stats(&img, &mask, &bbox, width, height);

        assert!(stats.edge_score < 0.01);
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

        // Mark only the pixels near the edge as changed
        let mut mask = vec![false; (width * height) as usize];
        for y in 0..height {
            for x in 9..12 {
                mask[(y * width + x) as usize] = true;
            }
        }

        let bbox = BoundingBox { x: 9, y: 0, width: 3, height };
        let stats = compute_gradient_stats(&img, &mask, &bbox, width, height);

        assert!(stats.edge_score > 0.3);
    }

    #[test]
    fn test_boundary_pixels() {
        let width = 5;
        let height = 5;
        let img = make_solid_image(width, height, 128, 128, 128);

        // Only corners
        let mut mask = vec![false; (width * height) as usize];
        mask[0] = true;
        mask[(width - 1) as usize] = true;
        mask[((height - 1) * width) as usize] = true;
        mask[((height - 1) * width + width - 1) as usize] = true;

        let bbox = BoundingBox { x: 0, y: 0, width, height };
        let stats = compute_gradient_stats(&img, &mask, &bbox, width, height);

        // Flat image, even at corners gradient should be ~0
        assert!(stats.edge_score < 0.01);
    }
}
