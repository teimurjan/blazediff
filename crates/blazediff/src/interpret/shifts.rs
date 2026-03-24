use crate::types::Image;

use super::types::{BoundingBox, ChangeRegion, ChangeType};

/// Post-classification pass: match Addition+Deletion pairs with similar
/// content to reclassify as Shift.
pub fn detect_shifts(
    regions: &mut [ChangeRegion],
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    width: u32,
) {
    let deletions: Vec<usize> = regions
        .iter()
        .enumerate()
        .filter(|(_, r)| r.change_type == ChangeType::Deletion)
        .map(|(i, _)| i)
        .collect();
    let additions: Vec<usize> = regions
        .iter()
        .enumerate()
        .filter(|(_, r)| r.change_type == ChangeType::Addition)
        .map(|(i, _)| i)
        .collect();

    let mut matched = std::collections::HashSet::new();

    for &d in &deletions {
        for &a in &additions {
            if matched.contains(&d) || matched.contains(&a) {
                continue;
            }

            // Size similarity within 40%
            let w_ratio = regions[d].bbox.width as f64 / regions[a].bbox.width.max(1) as f64;
            let h_ratio = regions[d].bbox.height as f64 / regions[a].bbox.height.max(1) as f64;
            if !(0.6..=1.67).contains(&w_ratio) || !(0.6..=1.67).contains(&h_ratio) {
                continue;
            }

            // Pixel count similarity within 50%
            let px_ratio = regions[d].pixel_count as f64 / regions[a].pixel_count.max(1) as f64;
            if !(0.67..=1.5).contains(&px_ratio) {
                continue;
            }

            // Content similarity: compare img1[deletion] with img2[addition]
            let (mean_d, std_d) = luminance_stats(img1, mask, &regions[d].bbox, width);
            let (mean_a, std_a) = luminance_stats(img2, mask, &regions[a].bbox, width);

            let mean_diff = (mean_d - mean_a).abs() / 255.0;
            let std_diff = (std_d - std_a).abs() / 255.0;

            if mean_diff < 0.15 && std_diff < 0.10 {
                matched.insert(d);
                matched.insert(a);
            }
        }
    }

    for &idx in &matched {
        regions[idx].change_type = ChangeType::Shift;
    }
}

/// Compute luminance stats of changed pixels in an image region.
/// Returns (mean_luminance, stddev_luminance).
pub fn luminance_stats(img: &Image, mask: &[bool], bbox: &BoundingBox, width: u32) -> (f64, f64) {
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
