//! Anti-aliasing detection based on "Anti-aliased Pixel and Intensity Slope Detector"
//! by V. Vysniauskas (2009). Examines 3x3 neighborhood to find gradient patterns.

use crate::types::Image;
use crate::yiq::color_delta;

#[cfg(target_arch = "x86_64")]
use std::sync::OnceLock;

#[cfg(target_arch = "x86_64")]
static HAS_SSE41: OnceLock<bool> = OnceLock::new();

#[cfg(target_arch = "x86_64")]
#[inline]
fn has_sse41() -> bool {
    *HAS_SSE41.get_or_init(|| is_x86_feature_detected!("sse4.1"))
}

/// Check if pixel has more than 2 identical neighbors (not anti-aliased edge)
#[inline]
fn has_many_siblings(image_u32: &[u32], x: u32, y: u32, width: u32, height: u32) -> bool {
    // Boundary pixels get +1 implicit match
    let on_boundary = x == 0 || x == width - 1 || y == 0 || y == height - 1;

    // Interior pixels can use fast SIMD path
    if !on_boundary {
        return has_many_siblings_simd(image_u32, x, y, width);
    }

    // Boundary fallback - scalar with bounds checking
    has_many_siblings_scalar(image_u32, x, y, width, height, 1)
}

/// SIMD-accelerated sibling check for interior pixels (no bounds checking needed)
#[inline]
fn has_many_siblings_simd(image_u32: &[u32], x: u32, y: u32, width: u32) -> bool {
    #[cfg(target_arch = "aarch64")]
    {
        has_many_siblings_neon(image_u32, x, y, width)
    }

    #[cfg(target_arch = "x86_64")]
    {
        if has_sse41() {
            unsafe { has_many_siblings_sse(image_u32, x, y, width) }
        } else {
            has_many_siblings_scalar(image_u32, x, y, width, u32::MAX, 0)
        }
    }

    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        has_many_siblings_scalar(image_u32, x, y, width, u32::MAX, 0)
    }
}

#[cfg(target_arch = "aarch64")]
#[inline]
fn has_many_siblings_neon(image_u32: &[u32], x: u32, y: u32, width: u32) -> bool {
    use std::arch::aarch64::*;

    let pos = (y * width + x) as usize;
    let val = image_u32[pos];

    unsafe {
        let center = vdupq_n_u32(val);

        // Load 3 pixels from row above: [x-1, x, x+1] at y-1
        let row_above = pos - width as usize;
        let above = vld1q_u32(image_u32.as_ptr().add(row_above - 1));
        // above contains [y-1,x-1], [y-1,x], [y-1,x+1], [y-1,x+2] - we need first 3

        // Load 3 pixels from current row: [x-1, x, x+1] at y (middle one is center, skip it)
        let left = image_u32[pos - 1];
        let right = image_u32[pos + 1];

        // Load 3 pixels from row below: [x-1, x, x+1] at y+1
        let row_below = pos + width as usize;
        let below = vld1q_u32(image_u32.as_ptr().add(row_below - 1));

        // Compare above row (first 3 elements)
        let cmp_above = vceqq_u32(above, center);
        // Count matches in above row (lanes 0,1,2)
        let above_bits = [
            vgetq_lane_u32(cmp_above, 0),
            vgetq_lane_u32(cmp_above, 1),
            vgetq_lane_u32(cmp_above, 2),
        ];
        let mut count =
            (above_bits[0] != 0) as u32 + (above_bits[1] != 0) as u32 + (above_bits[2] != 0) as u32;

        // Check left and right
        if left == val {
            count += 1;
        }
        if right == val {
            count += 1;
        }

        // Compare below row (first 3 elements)
        let cmp_below = vceqq_u32(below, center);
        let below_bits = [
            vgetq_lane_u32(cmp_below, 0),
            vgetq_lane_u32(cmp_below, 1),
            vgetq_lane_u32(cmp_below, 2),
        ];
        count +=
            (below_bits[0] != 0) as u32 + (below_bits[1] != 0) as u32 + (below_bits[2] != 0) as u32;

        count > 2
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn has_many_siblings_sse(image_u32: &[u32], x: u32, y: u32, width: u32) -> bool {
    use std::arch::x86_64::*;

    let pos = (y * width + x) as usize;
    let val = image_u32[pos];
    let center = _mm_set1_epi32(val as i32);

    // Load 4 pixels from row above starting at x-1
    let row_above = pos - width as usize;
    let above = _mm_loadu_si128(image_u32.as_ptr().add(row_above - 1) as *const __m128i);

    // Load left and right from current row
    let left = image_u32[pos - 1];
    let right = image_u32[pos + 1];

    // Load 4 pixels from row below starting at x-1
    let row_below = pos + width as usize;
    let below = _mm_loadu_si128(image_u32.as_ptr().add(row_below - 1) as *const __m128i);

    // Compare and count
    let cmp_above = _mm_cmpeq_epi32(above, center);
    let cmp_below = _mm_cmpeq_epi32(below, center);

    // Extract comparison results as mask
    let mask_above = _mm_movemask_ps(_mm_castsi128_ps(cmp_above)) & 0b0111; // first 3 bits
    let mask_below = _mm_movemask_ps(_mm_castsi128_ps(cmp_below)) & 0b0111;

    let mut count = mask_above.count_ones() + mask_below.count_ones();
    if left == val {
        count += 1;
    }
    if right == val {
        count += 1;
    }

    count > 2
}

/// Scalar fallback with bounds checking
#[inline]
fn has_many_siblings_scalar(
    image_u32: &[u32],
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    initial_count: u32,
) -> bool {
    let pos = (y * width + x) as usize;
    let val = image_u32[pos];
    let mut count = initial_count;

    let x0 = x.saturating_sub(1);
    let y0 = y.saturating_sub(1);
    let x1 = (x + 1).min(width - 1);
    let y1 = (y + 1).min(height - 1);

    for ny in y0..=y1 {
        for nx in x0..=x1 {
            if nx == x && ny == y {
                continue;
            }
            let idx = (ny * width + nx) as usize;
            if image_u32[idx] == val {
                count += 1;
                if count > 2 {
                    return true;
                }
            }
        }
    }

    count > 2
}

pub fn is_antialiased(image1: &Image, image2: &Image, x: u32, y: u32) -> bool {
    let a32 = image1.as_u32();
    let b32 = image2.as_u32();

    let width = image1.width;
    let height = image1.height;

    // Neighborhood bounds
    let x0 = x.saturating_sub(1);
    let y0 = y.saturating_sub(1);
    let x1 = (x + 1).min(width - 1);
    let y1 = (y + 1).min(height - 1);

    let pos = (y * width + x) as usize;
    let center_pixel = a32[pos];

    // Start with 1 if on boundary
    let mut zeroes = if x == x0 || x == x1 || y == y0 || y == y1 {
        1
    } else {
        0
    };

    let mut min_delta = 0.0f32;
    let mut max_delta = 0.0f32;
    let mut min_x = 0u32;
    let mut min_y = 0u32;
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    // Examine 8 adjacent pixels
    for ny in y0..=y1 {
        for nx in x0..=x1 {
            if nx == x && ny == y {
                continue;
            }

            let idx = (ny * width + nx) as usize;
            let adj_pixel = a32[idx];

            if adj_pixel == center_pixel {
                zeroes += 1;
                // If found more than 2 equal siblings, it's definitely not anti-aliasing
                if zeroes > 2 {
                    return false;
                }
            } else {
                // Calculate brightness delta (Y only) - cast to f32 for efficiency
                let delta = color_delta(center_pixel, adj_pixel, pos, true) as f32;

                if delta < min_delta {
                    min_delta = delta;
                    min_x = nx;
                    min_y = ny;
                } else if delta > max_delta {
                    max_delta = delta;
                    max_x = nx;
                    max_y = ny;
                }
            }
        }
    }

    // No contrast gradient means not antialiased
    if min_delta == 0.0 || max_delta == 0.0 {
        return false;
    }

    // Check if darkest/brightest sibling has many same-colored neighbors in both images
    // If either the darkest or the brightest pixel has 3+ equal siblings in both images
    // (definitely not anti-aliased), this pixel is anti-aliased
    (has_many_siblings(a32, min_x, min_y, width, height)
        && has_many_siblings(b32, min_x, min_y, width, height))
        || (has_many_siblings(a32, max_x, max_y, width, height)
            && has_many_siblings(b32, max_x, max_y, width, height))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yiq::pack_pixel;

    #[test]
    fn test_solid_region_not_antialiased() {
        // Create an image with a solid region
        let mut img = Image::new(10, 10);
        let white = pack_pixel(255, 255, 255, 255);

        // Fill entire image with white
        for pixel in img.as_u32_mut() {
            *pixel = white;
        }

        // Center pixel should NOT be antialiased (all neighbors identical)
        assert!(!is_antialiased(&img, &img, 5, 5));
    }

    #[test]
    fn test_edge_pixel_handling() {
        let mut img = Image::new(10, 10);
        let white = pack_pixel(255, 255, 255, 255);

        for pixel in img.as_u32_mut() {
            *pixel = white;
        }

        // Edge pixels should not crash
        assert!(!is_antialiased(&img, &img, 0, 0));
        assert!(!is_antialiased(&img, &img, 9, 9));
        assert!(!is_antialiased(&img, &img, 0, 9));
        assert!(!is_antialiased(&img, &img, 9, 0));
    }

    #[test]
    fn test_gradient_detection() {
        // Create an image with a gradient pattern
        let mut img = Image::new(10, 10);

        // Create a simple gradient
        for y in 0..10 {
            for x in 0..10 {
                let gray = ((x + y) * 12) as u8;
                let pixel = pack_pixel(gray, gray, gray, 255);
                img.set_pixel(x, y, pixel);
            }
        }

        // A gradient pixel might be detected as AA depending on the pattern
        // This is mainly a smoke test to ensure the algorithm runs
        let _ = is_antialiased(&img, &img, 5, 5);
    }
}
