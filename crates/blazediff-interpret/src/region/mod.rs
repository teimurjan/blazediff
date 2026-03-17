mod label_extract;
mod morphology;

use crate::types::BoundingBox;
use label_extract::extract_labeled_regions;
use morphology::morph_close;

struct UnionFind {
    parent: Vec<u32>,
    rank: Vec<u8>,
}

impl UnionFind {
    fn new(size: usize) -> Self {
        Self {
            parent: (0..size as u32).collect(),
            rank: vec![0; size],
        }
    }

    fn find(&mut self, mut x: u32) -> u32 {
        while self.parent[x as usize] != x {
            self.parent[x as usize] = self.parent[self.parent[x as usize] as usize];
            x = self.parent[x as usize];
        }
        x
    }

    fn union(&mut self, a: u32, b: u32) {
        let ra = self.find(a);
        let rb = self.find(b);
        if ra == rb {
            return;
        }
        match self.rank[ra as usize].cmp(&self.rank[rb as usize]) {
            std::cmp::Ordering::Less => self.parent[ra as usize] = rb,
            std::cmp::Ordering::Greater => self.parent[rb as usize] = ra,
            std::cmp::Ordering::Equal => {
                self.parent[rb as usize] = ra;
                self.rank[ra as usize] += 1;
            }
        }
    }
}

pub struct ComponentInfo {
    pub bbox: BoundingBox,
    pub pixel_count: u32,
}

/// Extract change mask from output image: a pixel is changed if it's not grayscale (R != G or R != B).
pub fn extract_change_mask(output_data: &[u8], width: u32, height: u32) -> Vec<bool> {
    let total = (width * height) as usize;
    let mut mask = vec![false; total];

    #[cfg(target_arch = "aarch64")]
    {
        // SAFETY: aarch64 always has NEON
        unsafe { extract_mask_neon(output_data.as_ptr(), &mut mask, total) };
        return mask;
    }

    #[cfg(not(target_arch = "aarch64"))]
    {
        for i in 0..total {
            let pos = i * 4;
            let r = output_data[pos];
            let g = output_data[pos + 1];
            let b = output_data[pos + 2];
            mask[i] = r != g || r != b;
        }
        mask
    }
}

/// NEON-accelerated change mask extraction. Processes 16 pixels at a time.
#[cfg(target_arch = "aarch64")]
unsafe fn extract_mask_neon(data: *const u8, mask: &mut [bool], count: usize) {
    use std::arch::aarch64::*;

    let chunks = count / 16;
    let mask_ptr = mask.as_mut_ptr() as *mut u8;

    for i in 0..chunks {
        let base = i * 16 * 4;
        // Load 64 bytes (16 RGBA pixels) as 4 interleaved channels
        let rgba = vld4q_u8(data.add(base));
        let r = rgba.0;
        let g = rgba.1;
        let b = rgba.2;

        // R != G
        let ne_rg = vmvnq_u8(vceqq_u8(r, g));
        // R != B
        let ne_rb = vmvnq_u8(vceqq_u8(r, b));
        // changed = (R != G) | (R != B)
        let changed = vorrq_u8(ne_rg, ne_rb);

        // Convert 0xFF to 0x01 for bool representation
        let ones = vdupq_n_u8(1);
        let result = vandq_u8(changed, ones);

        vst1q_u8(mask_ptr.add(i * 16), result);
    }

    // Scalar tail
    let processed = chunks * 16;
    for i in processed..count {
        let pos = i * 4;
        let r = *data.add(pos);
        let g = *data.add(pos + 1);
        let b = *data.add(pos + 2);
        mask[i] = r != g || r != b;
    }
}

/// Test-only: CC labeling without morph close, for unit testing the CC algorithm directly.
#[cfg(test)]
fn find_connected_components(mask: &[bool], width: u32, height: u32) -> Vec<ComponentInfo> {
    let labels = label_connected_components(mask, width, height);
    extract_labeled_regions(&labels, mask, width)
}

/// Label each foreground pixel with its connected component ID (4-connectivity).
/// Returns a label map: 0 = background, >0 = component label.
fn label_connected_components(mask: &[bool], width: u32, height: u32) -> Vec<i32> {
    let w = width as usize;
    let h = height as usize;
    let total = w * h;
    let mut labels = vec![0i32; total];

    if total == 0 {
        return labels;
    }

    let mut uf = UnionFind::new(total);

    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            if !mask[idx] {
                continue;
            }
            if x > 0 && mask[idx - 1] {
                uf.union(idx as u32, (idx - 1) as u32);
            }
            if y > 0 && mask[idx - w] {
                uf.union(idx as u32, (idx - w) as u32);
            }
        }
    }

    // Map roots to sequential labels
    let mut root_to_label: std::collections::HashMap<u32, i32> =
        std::collections::HashMap::new();
    let mut next_label = 1i32;

    for i in 0..total {
        if !mask[i] {
            continue;
        }
        let root = uf.find(i as u32);
        let label = *root_to_label.entry(root).or_insert_with(|| {
            let l = next_label;
            next_label += 1;
            l
        });
        labels[i] = label;
    }

    labels
}

/// Full region detection pipeline:
/// binary mask → morph close → connected components → extract with original mask
pub fn detect_regions(mask: &[bool], width: u32, height: u32) -> Vec<ComponentInfo> {
    let total = (width * height) as usize;
    if total == 0 || !mask.iter().any(|&m| m) {
        return Vec::new();
    }

    // 1. Morphological close to bridge small gaps
    let closed = morph_close(mask, width, height);

    // 2. Connected components on closed mask
    let labels = label_connected_components(&closed, width, height);

    // 3. Extract regions using original mask for pixel counts
    extract_labeled_regions(&labels, mask, width)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_change_mask_gray_pixels() {
        let data = vec![128, 128, 128, 255, 128, 128, 128, 255];
        let mask = extract_change_mask(&data, 2, 1);
        assert_eq!(mask, vec![false, false]);
    }

    #[test]
    fn test_extract_change_mask_colored_pixels() {
        let data = vec![255, 0, 0, 255, 128, 128, 128, 255];
        let mask = extract_change_mask(&data, 2, 1);
        assert_eq!(mask, vec![true, false]);
    }

    #[test]
    fn test_find_connected_components_empty() {
        let mask = vec![false; 9];
        let components = find_connected_components(&mask, 3, 3);
        assert!(components.is_empty());
    }

    #[test]
    fn test_find_connected_components_single_pixel() {
        let mut mask = vec![false; 9];
        mask[4] = true;
        let components = find_connected_components(&mask, 3, 3);
        assert_eq!(components.len(), 1);
        assert_eq!(components[0].pixel_count, 1);
        assert_eq!(
            components[0].bbox,
            BoundingBox {
                x: 1,
                y: 1,
                width: 1,
                height: 1,
            }
        );
    }

    #[test]
    fn test_find_connected_components_two_separate() {
        let mask = vec![true, false, false, false, true];
        let components = find_connected_components(&mask, 5, 1);
        assert_eq!(components.len(), 2);
    }

    #[test]
    fn test_find_connected_components_l_shape() {
        let mask = vec![
            true, false, false, true, false, false, true, true, true,
        ];
        let components = find_connected_components(&mask, 3, 3);
        assert_eq!(components.len(), 1);
        assert_eq!(components[0].pixel_count, 5);
        assert_eq!(
            components[0].bbox,
            BoundingBox {
                x: 0,
                y: 0,
                width: 3,
                height: 3,
            }
        );
    }

    #[test]
    fn test_detect_regions_empty() {
        let mask = vec![false; 100];
        let regions = detect_regions(&mask, 10, 10);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_detect_regions_single_blob() {
        let mut mask = vec![false; 10000]; // 100x100
        for y in 40..60 {
            for x in 40..60 {
                mask[y * 100 + x] = true;
            }
        }
        let regions = detect_regions(&mask, 100, 100);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].pixel_count, 400);
    }

    #[test]
    fn test_detect_regions_two_separate_blobs() {
        // Two blobs far apart — should stay separate
        let mut mask = vec![false; 10000]; // 100x100
        for y in 5..15 {
            for x in 5..15 {
                mask[y * 100 + x] = true;
            }
        }
        for y in 80..90 {
            for x in 80..90 {
                mask[y * 100 + x] = true;
            }
        }
        let regions = detect_regions(&mask, 100, 100);
        assert_eq!(regions.len(), 2);
    }

    #[test]
    fn test_detect_regions_nearby_blobs_bridged() {
        // Two blobs with small gap — morph close should bridge
        let mut mask = vec![false; 10000]; // 100x100
        // Blob 1
        for y in 40..50 {
            for x in 40..48 {
                mask[y * 100 + x] = true;
            }
        }
        // Blob 2 — gap of 3px
        for y in 40..50 {
            for x in 51..60 {
                mask[y * 100 + x] = true;
            }
        }
        let regions = detect_regions(&mask, 100, 100);
        // With adaptive radius=2 for 100x100, a 3px gap should be bridged
        assert_eq!(regions.len(), 1, "nearby blobs should be merged by morph close");
    }

    #[test]
    fn test_detect_regions_connected_bridge() {
        // Two blobs connected by a 1px bridge — single connected component
        let mut mask = vec![false; 50 * 20]; // 50x20
        for y in 6..14 {
            for x in 2..10 {
                mask[y * 50 + x] = true;
            }
        }
        for y in 6..14 {
            for x in 30..38 {
                mask[y * 50 + x] = true;
            }
        }
        for x in 10..30 {
            mask[10 * 50 + x] = true;
        }
        let regions = detect_regions(&mask, 50, 20);
        assert_eq!(regions.len(), 1, "connected blobs should be one region");
    }

    #[test]
    fn test_extract_mask_simd_matches_scalar() {
        // Test with various sizes to exercise SIMD + scalar tail
        for size in [1, 15, 16, 17, 31, 32, 33, 64, 100] {
            let mut data = vec![128u8; size * 4]; // all gray
            // Sprinkle some colored pixels
            for i in (0..size).step_by(3) {
                data[i * 4] = 255; // R=255, G=128, B=128 → changed
            }

            let mask = extract_change_mask(&data, size as u32, 1);

            for i in 0..size {
                let r = data[i * 4];
                let g = data[i * 4 + 1];
                let b = data[i * 4 + 2];
                let expected = r != g || r != b;
                assert_eq!(
                    mask[i], expected,
                    "mismatch at pixel {i} (size={size}): r={r} g={g} b={b}"
                );
            }
        }
    }
}
