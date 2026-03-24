use crate::types::Image;

use super::types::BoundingBox;

/// Evidence about content at a change region in both source images.
///
/// Compares changed pixels against nearby unchanged pixels (background)
/// to determine if content appeared, disappeared, or was modified.
pub struct ContentEvidence {
    /// Distance of changed pixels from local background in img1.
    /// Low = pixels blended with background (content was absent).
    pub bg_distance_img1: f64,
    /// Distance of changed pixels from local background in img2.
    pub bg_distance_img2: f64,
}

/// Threshold for "blends with background" — normalized RGB distance.
/// ~35 RGB units out of max ~442.
pub const BG_BLEND_THRESHOLD: f64 = 0.08;

pub fn analyze_content(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
    height: u32,
) -> ContentEvidence {
    match compute_bg_means(img1, img2, mask, bbox, width, height) {
        Some((bg1, bg2)) => ContentEvidence {
            bg_distance_img1: changed_pixel_distance(img1, mask, bbox, width, &bg1),
            bg_distance_img2: changed_pixel_distance(img2, mask, bbox, width, &bg2),
        },
        None => ContentEvidence {
            bg_distance_img1: 1.0,
            bg_distance_img2: 1.0,
        },
    }
}

/// Compute mean RGB of unchanged pixels near the change region.
///
/// First tries unchanged pixels within the bbox. Falls back to a 1px border
/// around the bbox if all pixels within are changed.
fn compute_bg_means(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
    height: u32,
) -> Option<([f64; 3], [f64; 3])> {
    let mut sum1 = [0.0f64; 3];
    let mut sum2 = [0.0f64; 3];
    let mut count = 0u64;

    // Try unchanged pixels within bbox
    for y in bbox.y..bbox.y + bbox.height {
        for x in bbox.x..bbox.x + bbox.width {
            let idx = (y * width + x) as usize;
            if !mask[idx] {
                accumulate(img1, img2, idx, &mut sum1, &mut sum2);
                count += 1;
            }
        }
    }

    if count > 0 {
        return Some((div3(&sum1, count), div3(&sum2, count)));
    }

    // Fallback: 1px border outside bbox
    let x_start = bbox.x.saturating_sub(1);
    let y_start = bbox.y.saturating_sub(1);
    let x_end = (bbox.x + bbox.width + 1).min(width);
    let y_end = (bbox.y + bbox.height + 1).min(height);

    for y in y_start..y_end {
        for x in x_start..x_end {
            if x >= bbox.x && x < bbox.x + bbox.width && y >= bbox.y && y < bbox.y + bbox.height {
                continue;
            }
            let idx = (y * width + x) as usize;
            accumulate(img1, img2, idx, &mut sum1, &mut sum2);
            count += 1;
        }
    }

    if count > 0 {
        Some((div3(&sum1, count), div3(&sum2, count)))
    } else {
        None
    }
}

#[inline(always)]
fn accumulate(img1: &Image, img2: &Image, idx: usize, sum1: &mut [f64; 3], sum2: &mut [f64; 3]) {
    let pos = idx * 4;
    sum1[0] += img1.data[pos] as f64;
    sum1[1] += img1.data[pos + 1] as f64;
    sum1[2] += img1.data[pos + 2] as f64;
    sum2[0] += img2.data[pos] as f64;
    sum2[1] += img2.data[pos + 1] as f64;
    sum2[2] += img2.data[pos + 2] as f64;
}

#[inline(always)]
fn div3(sum: &[f64; 3], count: u64) -> [f64; 3] {
    let c = count as f64;
    [sum[0] / c, sum[1] / c, sum[2] / c]
}

/// Mean distance of changed pixels from background reference, normalized to [0, 1].
fn changed_pixel_distance(
    img: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
    bg_mean: &[f64; 3],
) -> f64 {
    let mut total = 0.0f64;
    let mut count = 0u64;

    for y in bbox.y..bbox.y + bbox.height {
        for x in bbox.x..bbox.x + bbox.width {
            let idx = (y * width + x) as usize;
            if mask[idx] {
                let pos = idx * 4;
                let dr = img.data[pos] as f64 - bg_mean[0];
                let dg = img.data[pos + 1] as f64 - bg_mean[1];
                let db = img.data[pos + 2] as f64 - bg_mean[2];
                total += (dr * dr + dg * dg + db * db).sqrt();
                count += 1;
            }
        }
    }

    if count == 0 {
        return 0.0;
    }

    // max possible distance = sqrt(3) * 255
    let max_dist = 3.0_f64.sqrt() * 255.0;
    (total / count as f64 / max_dist).min(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::test_helpers::*;

    #[test]
    fn test_bg_estimated_from_surrounding_unchanged_pixels() {
        // White background with a red block in the center.
        // Background means should be ~(255, 255, 255).
        let w = 20u32;
        let h = 20u32;
        let mut img1 = make_solid_image(w, h, 255, 255, 255);
        fill_block(&mut img1, 8, 8, 4, 4, 255, 0, 0);
        let img2 = make_solid_image(w, h, 255, 255, 255);

        let mut mask = vec![false; (w * h) as usize];
        for y in 8..12 {
            for x in 8..12 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 8,
            y: 8,
            width: 4,
            height: 4,
        };
        let ev = analyze_content(&img1, &img2, &mask, &bbox, w, h);

        // img1 has red block far from white bg → high distance
        assert!(
            ev.bg_distance_img1 > 0.3,
            "Red block should be far from white bg, got {}",
            ev.bg_distance_img1
        );
        // img2 is all white, changed pixels are white → low distance
        assert!(
            ev.bg_distance_img2 < 0.01,
            "White-on-white should blend, got {}",
            ev.bg_distance_img2
        );
    }

    #[test]
    fn test_fallback_to_border_when_bbox_fully_masked() {
        // Entire bbox is masked (all pixels changed). Must fallback to 1px border.
        let w = 10u32;
        let h = 10u32;
        let img1 = make_solid_image(w, h, 100, 100, 100);
        let mut img2 = make_solid_image(w, h, 100, 100, 100);
        fill_block(&mut img2, 3, 3, 4, 4, 200, 200, 200);

        // Mark entire bbox as changed
        let mut mask = vec![false; (w * h) as usize];
        for y in 3..7 {
            for x in 3..7 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 3,
            y: 3,
            width: 4,
            height: 4,
        };
        let ev = analyze_content(&img1, &img2, &mask, &bbox, w, h);

        // Should still produce valid results via border fallback
        assert!(ev.bg_distance_img1 < 0.01, "Grey on grey bg should blend");
        assert!(
            ev.bg_distance_img2 > 0.1,
            "Bright block should be far from grey border bg"
        );
    }

    #[test]
    fn test_distance_always_normalized_0_to_1() {
        // Maximum possible distance: black vs white
        let w = 10u32;
        let h = 10u32;
        let img1 = make_solid_image(w, h, 0, 0, 0); // all black
        let mut img2 = make_solid_image(w, h, 0, 0, 0);
        fill_block(&mut img2, 2, 2, 6, 6, 255, 255, 255);

        let mut mask = vec![false; (w * h) as usize];
        for y in 2..8 {
            for x in 2..8 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 2,
            y: 2,
            width: 6,
            height: 6,
        };
        let ev = analyze_content(&img1, &img2, &mask, &bbox, w, h);

        assert!(
            ev.bg_distance_img1 >= 0.0 && ev.bg_distance_img1 <= 1.0,
            "bg_distance_img1 out of bounds: {}",
            ev.bg_distance_img1
        );
        assert!(
            ev.bg_distance_img2 >= 0.0 && ev.bg_distance_img2 <= 1.0,
            "bg_distance_img2 out of bounds: {}",
            ev.bg_distance_img2
        );
    }

    #[test]
    fn test_swapping_images_swaps_distances() {
        // Asymmetric case: img1 has object, img2 doesn't
        let w = 20u32;
        let h = 20u32;
        let mut img1 = make_solid_image(w, h, 128, 128, 128);
        fill_block(&mut img1, 6, 6, 8, 8, 255, 0, 0);
        let img2 = make_solid_image(w, h, 128, 128, 128);

        let mut mask = vec![false; (w * h) as usize];
        for y in 6..14 {
            for x in 6..14 {
                mask[(y * w + x) as usize] = true;
            }
        }

        let bbox = BoundingBox {
            x: 6,
            y: 6,
            width: 8,
            height: 8,
        };
        let ev_forward = analyze_content(&img1, &img2, &mask, &bbox, w, h);
        let ev_reverse = analyze_content(&img2, &img1, &mask, &bbox, w, h);

        // Swapping images should swap the distances
        assert!(
            (ev_forward.bg_distance_img1 - ev_reverse.bg_distance_img2).abs() < 0.01,
            "Swap should mirror: fwd.img1={} rev.img2={}",
            ev_forward.bg_distance_img1,
            ev_reverse.bg_distance_img2
        );
        assert!(
            (ev_forward.bg_distance_img2 - ev_reverse.bg_distance_img1).abs() < 0.01,
            "Swap should mirror: fwd.img2={} rev.img1={}",
            ev_forward.bg_distance_img2,
            ev_reverse.bg_distance_img1
        );
    }

    #[test]
    fn test_no_bg_pixels_returns_max_distance() {
        // 1x1 image where the only pixel is masked — no background available at all
        let w = 1u32;
        let h = 1u32;
        let img1 = make_solid_image(w, h, 128, 128, 128);
        let img2 = make_solid_image(w, h, 128, 128, 128);
        let mask = vec![true];

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        };
        let ev = analyze_content(&img1, &img2, &mask, &bbox, w, h);

        // Fallback: no bg pixels → returns (1.0, 1.0)
        assert_eq!(ev.bg_distance_img1, 1.0);
        assert_eq!(ev.bg_distance_img2, 1.0);
    }
}
