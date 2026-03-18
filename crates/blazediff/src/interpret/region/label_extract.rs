/// Extract labeled regions from a watershed label map into ComponentInfo structs.

use super::ComponentInfo;
use super::super::types::BoundingBox;
use std::collections::HashMap;

/// Convert a label map + original mask into ComponentInfo bounding boxes and pixel counts.
/// Only counts pixels where `original_mask[i]` is true (not morphologically added pixels).
/// Results sorted by pixel count descending.
pub fn extract_labeled_regions(
    labels: &[i32],
    original_mask: &[bool],
    width: u32,
) -> Vec<ComponentInfo> {
    let w = width as usize;
    let mut regions: HashMap<i32, ComponentInfo> = HashMap::new();

    for (i, (&label, &in_mask)) in labels.iter().zip(original_mask.iter()).enumerate() {
        if label <= 0 || !in_mask {
            continue;
        }

        let x = (i % w) as u32;
        let y = (i / w) as u32;

        let entry = regions.entry(label).or_insert_with(|| ComponentInfo {
            bbox: BoundingBox {
                x,
                y,
                width: 1,
                height: 1,
            },
            pixel_count: 0,
        });

        entry.pixel_count += 1;
        entry.bbox.expand(x, y);
    }

    let mut result: Vec<ComponentInfo> = regions.into_values().collect();
    result.sort_by(|a, b| b.pixel_count.cmp(&a.pixel_count));
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_label() {
        // 3x3 grid, all foreground labeled 1
        let labels = vec![1, 1, 1, 1, 1, 1, 1, 1, 1];
        let mask = vec![true; 9];
        let regions = extract_labeled_regions(&labels, &mask, 3);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pixel_count, 9);
        assert_eq!(regions[0].bbox, BoundingBox { x: 0, y: 0, width: 3, height: 3 });
    }

    #[test]
    fn test_two_labels() {
        // 4x1: label=[1, 1, 2, 2]
        let labels = vec![1, 1, 2, 2];
        let mask = vec![true; 4];
        let regions = extract_labeled_regions(&labels, &mask, 4);

        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].pixel_count, 2);
        assert_eq!(regions[1].pixel_count, 2);
    }

    #[test]
    fn test_original_mask_filtering() {
        // Morphologically added pixels (in labels but not in original mask) should not be counted
        let labels = vec![1, 1, 1, 1];
        let mask = vec![true, false, false, true]; // only first and last are original
        let regions = extract_labeled_regions(&labels, &mask, 4);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pixel_count, 2); // only original mask pixels
        assert_eq!(regions[0].bbox, BoundingBox { x: 0, y: 0, width: 4, height: 1 });
    }

    #[test]
    fn test_sorted_by_pixel_count_desc() {
        // 6x1: label=[1, 1, 1, 2, 2, 3]
        let labels = vec![1, 1, 1, 2, 2, 3];
        let mask = vec![true; 6];
        let regions = extract_labeled_regions(&labels, &mask, 6);

        assert_eq!(regions.len(), 3);
        assert_eq!(regions[0].pixel_count, 3);
        assert_eq!(regions[1].pixel_count, 2);
        assert_eq!(regions[2].pixel_count, 1);
    }

    #[test]
    fn test_no_foreground() {
        let labels = vec![0; 9];
        let mask = vec![false; 9];
        let regions = extract_labeled_regions(&labels, &mask, 3);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_bbox_correctness() {
        // 5x5, label 1 at (1,1), (3,1), (2,3)
        let mut labels = vec![0i32; 25];
        let mut mask = vec![false; 25];

        for &(x, y) in &[(1, 1), (3, 1), (2, 3)] {
            let idx = y * 5 + x;
            labels[idx] = 1;
            mask[idx] = true;
        }

        let regions = extract_labeled_regions(&labels, &mask, 5);

        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pixel_count, 3);
        assert_eq!(regions[0].bbox, BoundingBox { x: 1, y: 1, width: 3, height: 3 });
    }
}
