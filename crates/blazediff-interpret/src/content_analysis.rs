use blazediff::Image;

use crate::types::BoundingBox;

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

    // max possible distance = sqrt(3) * 255 ≈ 441.67
    total / count as f64 / 441.67
}

/// Compute luminance stats of changed pixels in an image region.
/// Returns (mean_luminance, stddev_luminance).
pub fn luminance_stats(
    img: &Image,
    mask: &[bool],
    bbox: &BoundingBox,
    width: u32,
) -> (f64, f64) {
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in bbox.y..bbox.y + bbox.height {
        for x in bbox.x..bbox.x + bbox.width {
            let idx = (y * width + x) as usize;
            if mask[idx] {
                let pos = idx * 4;
                let lum = 0.299 * img.data[pos] as f64
                    + 0.587 * img.data[pos + 1] as f64
                    + 0.114 * img.data[pos + 2] as f64;
                sum += lum;
                sum_sq += lum * lum;
                count += 1;
            }
        }
    }

    if count == 0 {
        return (0.0, 0.0);
    }

    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64 - mean * mean).max(0.0);
    (mean, variance.sqrt())
}
