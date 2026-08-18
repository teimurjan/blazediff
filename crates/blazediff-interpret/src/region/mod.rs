mod label_extract;
mod morphology;

use super::types::BoundingBox;
use blazediff_shared::yiq::color_delta;
use blazediff_shared::Image;
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
    let mut root_to_label: std::collections::HashMap<u32, i32> = std::collections::HashMap::new();
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

/// Squared YIQ delta above which a pixel counts as touched at all. Far below
/// the diff's own threshold on purpose: the question here is not what changed
/// enough to report, it is whether the pixels *between* two reported patches
/// were left alone. 16.0 is a YIQ-weighted distance of 4, a perceptual delta
/// of roughly 0.007.
const TOUCHED_DELTA: f64 = 16.0;

/// Share of a bounding box that must be touched for the patches inside it to
/// count as fragments of one change.
const TOUCHED_SHARE_FLOOR: f64 = 0.45;

/// How much of any rectangle differs between the two images at all, answered
/// in constant time from a summed-area table.
///
/// Merging patches is a question about the gaps between them, and the change
/// mask cannot answer it: everything below the diff threshold reads as
/// background there. A regenerated or recolored area leaves a faint delta
/// across the whole of itself, so its patches sit in touched space; two
/// distinct edits are separated by pixels that are identical in both images.
pub struct ChangeDensity {
    /// Inclusive prefix sums of touched pixels, `(width + 1) * (height + 1)`.
    sums: Vec<u32>,
    width: usize,
}

impl ChangeDensity {
    pub fn new(img1: &Image, img2: &Image) -> Self {
        let width = img1.width as usize;
        let height = img1.height as usize;
        let pixels1 = img1.as_u32();
        let pixels2 = img2.as_u32();
        let stride = width + 1;
        let mut sums = vec![0u32; stride * (height + 1)];

        for y in 0..height {
            let mut row_total = 0u32;
            for x in 0..width {
                let index = y * width + x;
                if color_delta(pixels1[index], pixels2[index], index).abs() > TOUCHED_DELTA {
                    row_total += 1;
                }
                sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row_total;
            }
        }

        Self { sums, width }
    }

    /// Share of `bbox` that differs between the two images, in `0.0..=1.0`.
    pub fn share(&self, bbox: &BoundingBox) -> f64 {
        let area = (bbox.width as f64) * (bbox.height as f64);
        if area <= 0.0 {
            return 0.0;
        }
        let stride = self.width + 1;
        let height = self.sums.len() / stride - 1;
        let x0 = (bbox.x as usize).min(self.width);
        let y0 = (bbox.y as usize).min(height);
        let x1 = ((bbox.x + bbox.width) as usize).min(self.width);
        let y1 = ((bbox.y + bbox.height) as usize).min(height);
        let touched = self.sums[y1 * stride + x1] + self.sums[y0 * stride + x0]
            - self.sums[y0 * stride + x1]
            - self.sums[y1 * stride + x0];
        touched as f64 / area
    }
}

fn union(a: &BoundingBox, b: &BoundingBox) -> BoundingBox {
    let x = a.x.min(b.x);
    let y = a.y.min(b.y);
    let right = (a.x + a.width).max(b.x + b.width);
    let bottom = (a.y + a.height).max(b.y + b.height);
    BoundingBox {
        x,
        y,
        width: right - x,
        height: bottom - y,
    }
}

/// Merge components whose bounding boxes overlap (or sit within `slack`
/// pixels of each other) into single regions. Fragmented detections — an
/// inpainted photo region shattered into dozens of patches by the diff —
/// have heavily interleaved bboxes, while genuinely separate changes do not,
/// so bbox proximity is a reliable merge criterion where a larger
/// morphological radius would bridge unrelated regions across background.
///
/// Proximity alone is not enough, because every merge widens the box and a
/// wider box reaches further: on a dense screenshot single linkage walks from
/// one change to the next until the region spans half the image. A merge is
/// therefore refused unless [`ChangeDensity`] finds the enclosing box mostly
/// touched, which is true of one change scattered into patches and false of
/// two changes with untouched background between them.
pub fn merge_overlapping_components(
    mut components: Vec<ComponentInfo>,
    slack_x: u32,
    slack_y: u32,
    density: &ChangeDensity,
) -> Vec<ComponentInfo> {
    let near = |a: &BoundingBox, b: &BoundingBox| -> bool {
        a.x <= b.x + b.width + slack_x
            && b.x <= a.x + a.width + slack_x
            && a.y <= b.y + b.height + slack_y
            && b.y <= a.y + a.height + slack_y
    };

    loop {
        let mut merged_any = false;
        let mut result: Vec<ComponentInfo> = Vec::with_capacity(components.len());
        'outer: for component in components {
            for existing in &mut result {
                if !near(&existing.bbox, &component.bbox) {
                    continue;
                }
                let merged_bbox = union(&existing.bbox, &component.bbox);
                // A component that already sits inside the region adds no
                // background, whatever the density says.
                if merged_bbox != existing.bbox && density.share(&merged_bbox) < TOUCHED_SHARE_FLOOR
                {
                    continue;
                }
                existing.bbox = merged_bbox;
                existing.pixel_count += component.pixel_count;
                merged_any = true;
                continue 'outer;
            }
            result.push(component);
        }
        components = result;
        if !merged_any {
            components.sort_by(|a, b| b.pixel_count.cmp(&a.pixel_count));
            return components;
        }
    }
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
    use crate::test_helpers::{fill_block, make_solid_image};

    fn comp(x: u32, y: u32, w: u32, h: u32, pixels: u32) -> ComponentInfo {
        ComponentInfo {
            bbox: BoundingBox {
                x,
                y,
                width: w,
                height: h,
            },
            pixel_count: pixels,
        }
    }

    #[test]
    fn change_density_share_matches_brute_force() {
        // A recolored strip down the middle; the background is untouched.
        let img1 = make_solid_image(40, 30, 10, 10, 10);
        let mut img2 = make_solid_image(40, 30, 10, 10, 10);
        fill_block(&mut img2, 12, 0, 8, 30, 200, 40, 40);
        let density = ChangeDensity::new(&img1, &img2);

        // The strip is fully touched, the whole image is 8/40 touched.
        let strip = BoundingBox {
            x: 12,
            y: 0,
            width: 8,
            height: 30,
        };
        assert!((density.share(&strip) - 1.0).abs() < 1e-9);
        let full = BoundingBox {
            x: 0,
            y: 0,
            width: 40,
            height: 30,
        };
        assert!((density.share(&full) - 8.0 / 40.0).abs() < 1e-9);
        // An untouched corner is empty.
        let corner = BoundingBox {
            x: 0,
            y: 0,
            width: 8,
            height: 8,
        };
        assert_eq!(density.share(&corner), 0.0);
    }

    #[test]
    fn merge_bridges_fragments_of_one_change() {
        // Two nearby patches with the gap between them also changed: one
        // fragmented change, so the union is dense and they merge.
        let img1 = make_solid_image(60, 20, 10, 10, 10);
        let mut img2 = make_solid_image(60, 20, 10, 10, 10);
        fill_block(&mut img2, 5, 5, 32, 10, 220, 30, 30);
        let density = ChangeDensity::new(&img1, &img2);

        // 8px gap between the boxes, within the 12px slack.
        let components = vec![comp(5, 5, 12, 10, 120), comp(25, 5, 12, 10, 120)];
        let merged = merge_overlapping_components(components, 12, 8, &density);
        assert_eq!(merged.len(), 1, "dense union should merge");
    }

    #[test]
    fn merge_keeps_distinct_changes_apart() {
        // Two distinct changes, each a thin mark inside a larger box with
        // untouched background around it — the shape a map label or a table
        // cell takes. The boxes sit within the 12px slack, so proximity alone
        // would merge them; the sparse union must stop it.
        let img1 = make_solid_image(60, 20, 10, 10, 10);
        let mut img2 = make_solid_image(60, 20, 10, 10, 10);
        fill_block(&mut img2, 7, 5, 1, 12, 220, 30, 30);
        fill_block(&mut img2, 20, 5, 1, 12, 30, 30, 220);
        let density = ChangeDensity::new(&img1, &img2);

        let components = vec![comp(5, 5, 10, 12, 12), comp(18, 5, 10, 12, 12)];
        let merged = merge_overlapping_components(components, 12, 8, &density);
        assert_eq!(merged.len(), 2, "sparse union should stay split");
    }

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
        let mask = vec![true, false, false, true, false, false, true, true, true];
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
        // Two blobs far apart - should stay separate
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
        // Two blobs with small gap - morph close should bridge
        let mut mask = vec![false; 10000]; // 100x100
                                           // Blob 1
        for y in 40..50 {
            for x in 40..48 {
                mask[y * 100 + x] = true;
            }
        }
        // Blob 2 - gap of 3px
        for y in 40..50 {
            for x in 51..60 {
                mask[y * 100 + x] = true;
            }
        }
        let regions = detect_regions(&mask, 100, 100);
        // With adaptive radius=2 for 100x100, a 3px gap should be bridged
        assert_eq!(
            regions.len(),
            1,
            "nearby blobs should be merged by morph close"
        );
    }

    #[test]
    fn test_detect_regions_connected_bridge() {
        // Two blobs connected by a 1px bridge - single connected component
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
