/// Morphological close (dilate then erode) with separable flat structuring element.
/// Bridges small gaps between nearby changed pixels.

/// Morphological close: dilate followed by erode.
/// Adaptive radius based on image dimensions.
pub fn morph_close(mask: &[bool], width: u32, height: u32) -> Vec<bool> {
    let radius = adaptive_radius(width, height);
    if radius == 0 {
        return mask.to_vec();
    }
    let dilated = dilate(mask, width, height, radius);
    erode(&dilated, width, height, radius)
}

fn adaptive_radius(width: u32, height: u32) -> u32 {
    (width.max(height) / 200).clamp(2, 15)
}

/// Separable dilate: horizontal pass then vertical pass.
/// Each pass replaces pixel with max(neighborhood of radius r).
fn dilate(mask: &[bool], width: u32, height: u32, radius: u32) -> Vec<bool> {
    let w = width as usize;
    let h = height as usize;
    let r = radius as usize;

    // Horizontal pass
    let mut horiz = vec![false; w * h];
    for y in 0..h {
        let row_start = y * w;
        // Sliding window max using running count of true pixels
        let mut count = 0usize;
        // Initialize window [0, min(r, w-1)]
        let init_end = r.min(w - 1);
        for x in 0..=init_end {
            if mask[row_start + x] {
                count += 1;
            }
        }
        horiz[row_start] = count > 0;

        for x in 1..w {
            // Add right edge
            let add = x + r;
            if add < w && mask[row_start + add] {
                count += 1;
            }
            // Remove left edge
            if x > r + 1 {
                // The pixel that just left the window
                let rem = x - r - 1;
                if mask[row_start + rem] {
                    count -= 1;
                }
            } else if x == r + 1 {
                let rem = 0;
                if mask[row_start + rem] {
                    count -= 1;
                }
            }
            horiz[row_start + x] = count > 0;
        }
    }

    // Vertical pass on horiz result
    let mut result = vec![false; w * h];
    for x in 0..w {
        let mut count = 0usize;
        let init_end = r.min(h - 1);
        for y in 0..=init_end {
            if horiz[y * w + x] {
                count += 1;
            }
        }
        result[x] = count > 0;

        for y in 1..h {
            let add = y + r;
            if add < h && horiz[add * w + x] {
                count += 1;
            }
            if y > r + 1 {
                let rem = y - r - 1;
                if horiz[rem * w + x] {
                    count -= 1;
                }
            } else if y == r + 1 {
                if horiz[x] {
                    count -= 1;
                }
            }
            result[y * w + x] = count > 0;
        }
    }

    result
}

/// Separable erode: horizontal pass then vertical pass.
/// Each pass replaces pixel with min(neighborhood of radius r).
fn erode(mask: &[bool], width: u32, height: u32, radius: u32) -> Vec<bool> {
    let w = width as usize;
    let h = height as usize;
    let r = radius as usize;

    // Horizontal pass
    let mut horiz = vec![false; w * h];
    for y in 0..h {
        let row_start = y * w;
        let mut count = 0usize;
        // Count true in initial window [0, min(r, w-1)]
        let init_end = r.min(w - 1);
        for x in 0..=init_end {
            if mask[row_start + x] {
                count += 1;
            }
        }
        // For x=0, the window is [0, r] — clipped window size is min(r+1, w)
        let effective_size = (r + 1).min(w);
        horiz[row_start] = count == effective_size;

        for x in 1..w {
            let add = x + r;
            if add < w && mask[row_start + add] {
                count += 1;
            }
            if x > r + 1 {
                let rem = x - r - 1;
                if mask[row_start + rem] {
                    count -= 1;
                }
            } else if x == r + 1 {
                if mask[row_start] {
                    count -= 1;
                }
            }
            // Effective window size for position x
            let left = if x > r { x - r } else { 0 };
            let right = (x + r).min(w - 1);
            let eff = right - left + 1;
            horiz[row_start + x] = count == eff;
        }
    }

    // Vertical pass
    let mut result = vec![false; w * h];
    for x in 0..w {
        let mut count = 0usize;
        let init_end = r.min(h - 1);
        for y in 0..=init_end {
            if horiz[y * w + x] {
                count += 1;
            }
        }
        let effective_size = (r + 1).min(h);
        result[x] = count == effective_size;

        for y in 1..h {
            let add = y + r;
            if add < h && horiz[add * w + x] {
                count += 1;
            }
            if y > r + 1 {
                let rem = y - r - 1;
                if horiz[rem * w + x] {
                    count -= 1;
                }
            } else if y == r + 1 {
                if horiz[x] {
                    count -= 1;
                }
            }
            let top = if y > r { y - r } else { 0 };
            let bottom = (y + r).min(h - 1);
            let eff = bottom - top + 1;
            result[y * w + x] = count == eff;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dilate_single_pixel() {
        // 11x11 grid, single pixel at center (5,5)
        let w = 11u32;
        let h = 11u32;
        let mut mask = vec![false; (w * h) as usize];
        mask[5 * 11 + 5] = true;

        let dilated = dilate(&mask, w, h, 2);

        // Should expand by radius=2 in all directions (square kernel)
        for y in 0..h {
            for x in 0..w {
                let expected = x >= 3 && x <= 7 && y >= 3 && y <= 7;
                assert_eq!(
                    dilated[(y * w + x) as usize],
                    expected,
                    "mismatch at ({x},{y}): got {}, expected {expected}",
                    dilated[(y * w + x) as usize]
                );
            }
        }
    }

    #[test]
    fn test_erode_removes_thin_line() {
        // 5x5 grid, single row of pixels at y=2
        let w = 5u32;
        let h = 5u32;
        let mut mask = vec![false; 25];
        for x in 0..5 {
            mask[2 * 5 + x] = true;
        }

        let eroded = erode(&mask, w, h, 1);

        // 1px wide line eroded with radius 1 should disappear (needs 3px height to survive)
        for i in 0..25 {
            assert!(!eroded[i], "pixel {i} should be eroded away");
        }
    }

    #[test]
    fn test_close_bridges_small_gap() {
        // Two 3x3 blobs separated by a 2px gap, radius=2 should bridge
        let w = 12u32;
        let h = 5u32;
        let mut mask = vec![false; (w * h) as usize];

        // Blob 1: (1,1) to (3,3)
        for y in 1..4 {
            for x in 1..4 {
                mask[(y * w + x) as usize] = true;
            }
        }
        // Blob 2: (6,1) to (8,3) — gap of 2px (x=4,5 empty)
        for y in 1..4 {
            for x in 6..9 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let closed = morph_close(&mask, w, h);

        // After close with radius ≥ 2, gap should be bridged
        // Check that at least some gap pixels are now true
        let gap_filled = (1..4).any(|y: u32| {
            (4..6).any(|x: u32| closed[(y * w + x) as usize])
        });
        assert!(gap_filled, "close should bridge the 2px gap");
    }

    #[test]
    fn test_close_preserves_original_blobs() {
        // Single blob should remain mostly unchanged after close
        let w = 10u32;
        let h = 10u32;
        let mut mask = vec![false; 100];
        for y in 3..7 {
            for x in 3..7 {
                mask[y * 10 + x] = true;
            }
        }

        let closed = morph_close(&mask, w, h);

        // All original pixels should still be set
        for y in 3..7 {
            for x in 3..7 {
                assert!(closed[y * 10 + x], "original pixel ({x},{y}) lost after close");
            }
        }
    }

    #[test]
    fn test_close_doesnt_bridge_large_gap() {
        // Two blobs separated by 30px gap, adaptive radius for 100x100 = 2
        // Gap of 30 >> 2*radius=4, should NOT bridge
        let w = 100u32;
        let h = 10u32;
        let mut mask = vec![false; (w * h) as usize];

        for y in 3..7 {
            for x in 5..10 {
                mask[(y * w + x) as usize] = true;
            }
        }
        for y in 3..7 {
            for x in 60..65 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let closed = morph_close(&mask, w, h);

        // Middle of the gap should remain false
        assert!(!closed[(5 * w + 35) as usize], "large gap should not be bridged");
    }
}
