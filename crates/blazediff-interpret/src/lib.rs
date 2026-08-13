//! Structured region analysis: given two images and a set of changed regions,
//! describe what changed in each one.
//!
//! The classifier is deliberately separate from whatever *found* the regions.
//! `blazediff` finds them by connected components over a pixel-diff mask,
//! `blazediff-ssim` can find them by thresholding a score map, and a caller can
//! simply supply them — DOM rectangles, a JS-side diff, anything. All three get
//! identical per-pixel classification, because a coarse region is refined
//! against the source pixels before any statistic is computed.
//!
//! ```
//! use blazediff_interpret::{interpret_regions, types::BoundingBox};
//! # use blazediff_shared::Image;
//! # let (a, b) = (Image::new(64, 64), Image::new(64, 64));
//! let result = interpret_regions(&a, &b, &[BoundingBox { x: 8, y: 8, width: 16, height: 16 }])?;
//! println!("{}", result.summary);
//! # Ok::<(), blazediff_interpret::InterpretError>(())
//! ```

//! Deterministic image diff analysis.
//!
//! Wraps `blazediff::diff()` to produce structured, human/agent-readable results:
//! region detection via connected-component labeling, spatial positions, severity,
//! color delta analysis, gradient scoring, and semantic interpretation.

mod color_delta;
mod content_analysis;
mod gradient;
mod interpretation;
mod region;
mod severity;
mod shape;
mod shifts;
mod spatial;
mod summary;
// Small image constructors shared by this crate's tests and by `blazediff`'s
// end-to-end interpret tests, which live there because they need `diff`.
#[cfg(any(test, feature = "testing"))]
#[doc(hidden)]
pub mod test_helpers;
pub mod types;

use blazediff_shared::yiq::color_delta;
use blazediff_shared::Image;
use color_delta::compute_color_delta;
use content_analysis::analyze_content;
use gradient::{compute_gradient_stats, compute_luminance_ncc};
use interpretation::classify_change_type;
use shape::{classify_shape, compute_shape_stats};

use spatial::classify_position;
use types::ChangeType;

/// YIQ squared-delta floor for treating a pixel as actually changed.
/// 100.0 corresponds to a YIQ-weighted distance of 10, roughly equivalent to
/// a perceptual delta of ~0.017 — filters near-identical pixels without
/// throwing away genuine edits.
pub use region::{detect_regions, extract_change_mask, ComponentInfo};
pub use severity::classify_severity;
// Exposed for producers that already hold an exact per-pixel mask and so must
// not go through `classify_regions`, which refines a coarse one.
pub use shifts::detect_shifts;
pub use summary::build_summary;
pub use types::{BoundingBox, ChangeRegion, ChangeSeverity, InterpretResult};

/// Why a set of regions could not be interpreted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InterpretError {
    /// The two images are not the same size, so one mask cannot describe both.
    SizeMismatch {
        img1_width: u32,
        img1_height: u32,
        img2_width: u32,
        img2_height: u32,
    },
    /// A supplied region falls outside the image. Regions arrive from callers
    /// now — including across the wasm and N-API boundaries — so this is a
    /// rejection rather than an out-of-bounds panic.
    RegionOutOfBounds {
        bbox: BoundingBox,
        width: u32,
        height: u32,
    },
}

impl std::fmt::Display for InterpretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InterpretError::SizeMismatch {
                img1_width,
                img1_height,
                img2_width,
                img2_height,
            } => write!(
                f,
                "Image sizes do not match: {}x{} vs {}x{}",
                img1_width, img1_height, img2_width, img2_height
            ),
            InterpretError::RegionOutOfBounds {
                bbox,
                width,
                height,
            } => write!(
                f,
                "Region {}x{} at ({}, {}) falls outside the {}x{} image",
                bbox.width, bbox.height, bbox.x, bbox.y, width, height
            ),
        }
    }
}

impl std::error::Error for InterpretError {}

const REFINE_DELTA_FLOOR_SQ: f32 = 100.0;

/// Refine a coarse mask down to the actually-changed pixels inside the given
/// bboxes. Pixels marked true in `input_mask` but with a tiny YIQ delta between
/// `img1` and `img2` are dropped. Used by classifier-only paths so callers can
/// pass a bbox-filled mask without polluting statistics with unchanged content.
fn refine_change_mask_in_bboxes(
    img1: &Image,
    img2: &Image,
    input_mask: &[bool],
    bboxes: &[types::BoundingBox],
    width: u32,
) -> Vec<bool> {
    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();
    let mut refined = input_mask.to_vec();
    for bbox in bboxes {
        for y in bbox.y..bbox.y + bbox.height {
            for x in bbox.x..bbox.x + bbox.width {
                let idx = (y * width + x) as usize;
                if !refined[idx] {
                    continue;
                }
                let delta = color_delta(pixels1[idx], pixels2[idx], idx).abs() as f32;
                if delta < REFINE_DELTA_FLOOR_SQ {
                    refined[idx] = false;
                }
            }
        }
    }
    refined
}

fn count_mask_pixels(mask: &[bool], bbox: &types::BoundingBox, width: u32) -> u32 {
    let mut pixel_count = 0u32;
    for y in bbox.y..bbox.y + bbox.height {
        for x in bbox.x..bbox.x + bbox.width {
            if mask[(y * width + x) as usize] {
                pixel_count += 1;
            }
        }
    }
    pixel_count
}

fn classify_region_with_mask(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: types::BoundingBox,
) -> ChangeRegion {
    let width = img1.width;
    let height = img1.height;
    let total_pixels = (width * height) as f64;
    let pixel_count = count_mask_pixels(mask, &bbox, width);
    let percentage = if total_pixels > 0.0 {
        100.0 * pixel_count as f64 / total_pixels
    } else {
        0.0
    };
    let shape_stats = compute_shape_stats(mask, width, &bbox, pixel_count);
    let shape = classify_shape(&shape_stats);
    let position = classify_position(&bbox, width, height);

    let color_delta = compute_color_delta(img1, img2, mask, &bbox, width);
    let gradient_stats = compute_gradient_stats(img1, img2, mask, &bbox, width, height);
    let luminance_ncc = compute_luminance_ncc(img1, img2, mask, &bbox, width);
    let content = analyze_content(img1, img2, mask, &bbox, width, height);
    let (change_type, signals) = classify_change_type(
        &content,
        &color_delta,
        &gradient_stats,
        &shape_stats,
        &bbox,
        luminance_ncc,
    );

    ChangeRegion {
        bbox,
        pixel_count,
        percentage,
        position,
        shape,
        shape_stats,
        change_type,
        signals,
        confidence: signals.confidence,
        color_delta,
        gradient: gradient_stats,
    }
}

/// Classify a known change region against a provided full-image change mask.
///
/// The mask is evaluated only inside `bbox`, so callers may pass a sparse mask
/// with one or more labeled regions already marked.
pub fn classify_region(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: types::BoundingBox,
) -> ChangeRegion {
    classify_region_with_mask(img1, img2, mask, bbox)
}

/// Classify multiple known regions, then run the same shift relabeling pass used
/// by `interpret()` so classifier-only verification can evaluate final labels.
///
/// The caller-supplied `mask` may be coarse (e.g., bbox-filled for verifier
/// tooling); we refine it to actually-changed pixels inside each bbox before
/// classification so per-pixel statistics aren't diluted by unchanged content.
pub fn classify_regions(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bboxes: &[types::BoundingBox],
) -> Vec<ChangeRegion> {
    let width = img1.width;
    let refined = refine_change_mask_in_bboxes(img1, img2, mask, bboxes, width);
    let mut regions: Vec<ChangeRegion> = bboxes
        .iter()
        .copied()
        .map(|bbox| classify_region_with_mask(img1, img2, &refined, bbox))
        .collect();
    detect_shifts(&mut regions, img1, img2, &refined, width);
    regions
}

/// Interpret a set of caller-supplied change regions.
///
/// This is the entry point for producers that already know *where* things
/// changed and want to know *what* changed. The regions may be as coarse as the
/// producer likes — an SSIM score map's window grid, say — because the mask is
/// refined against the source pixels inside each box before any statistic is
/// computed, so shape, colour and gradient analysis stay per-pixel regardless.
///
/// `diff_count` is the number of pixels that survive that refinement, so it
/// means the same thing it does on the pixel-diff path: actually-changed
/// pixels, not windows.
///
/// Regions that classify as rendering noise are dropped, as they are by
/// `blazediff`'s end-to-end `interpret`.
pub fn interpret_regions(
    image1: &Image,
    image2: &Image,
    regions: &[BoundingBox],
) -> Result<InterpretResult, InterpretError> {
    let (width, height) = (image1.width, image1.height);
    if width != image2.width || height != image2.height {
        return Err(InterpretError::SizeMismatch {
            img1_width: width,
            img1_height: height,
            img2_width: image2.width,
            img2_height: image2.height,
        });
    }

    for bbox in regions {
        // u32 arithmetic, so check the sums for overflow rather than trusting
        // `x + width <= image_width` to stay in range.
        let right = bbox.x.checked_add(bbox.width);
        let bottom = bbox.y.checked_add(bbox.height);
        let fits = matches!((right, bottom), (Some(r), Some(b)) if r <= width && b <= height);
        if !fits {
            return Err(InterpretError::RegionOutOfBounds {
                bbox: *bbox,
                width,
                height,
            });
        }
    }

    let total_pixels = (width as f64) * (height as f64);
    if regions.is_empty() || total_pixels == 0.0 {
        return Ok(InterpretResult {
            summary: "Images are identical".to_string(),
            diff_count: 0,
            total_regions: 0,
            regions: Vec::new(),
            severity: classify_severity(0.0),
            diff_percentage: 0.0,
            width,
            height,
        });
    }

    // Fill every supplied box; `classify_regions` refines it down to the
    // pixels that actually differ before classifying.
    let mut mask = vec![false; (width * height) as usize];
    for bbox in regions {
        for y in bbox.y..bbox.y + bbox.height {
            let row = (y * width) as usize;
            mask[row + bbox.x as usize..row + (bbox.x + bbox.width) as usize].fill(true);
        }
    }

    let mut classified = classify_regions(image1, image2, &mask, regions);
    classified.retain(|region| region.change_type != ChangeType::RenderingNoise);

    let diff_count: u32 = classified.iter().map(|region| region.pixel_count).sum();
    let diff_percentage = 100.0 * diff_count as f64 / total_pixels;
    let severity = classify_severity(diff_percentage);
    let summary = build_summary(&classified, &severity, diff_percentage);

    Ok(InterpretResult {
        summary,
        diff_count,
        total_regions: classified.len(),
        regions: classified,
        severity,
        diff_percentage,
        width,
        height,
    })
}

#[cfg(test)]
mod region_entry_tests {
    use super::*;
    use crate::test_helpers::*;

    fn bbox(x: u32, y: u32, width: u32, height: u32) -> BoundingBox {
        BoundingBox {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn no_regions_means_identical() {
        let a = make_solid_image(64, 64, 10, 20, 30);
        let result = interpret_regions(&a, &a, &[]).unwrap();
        assert_eq!(result.summary, "Images are identical");
        assert_eq!(result.diff_count, 0);
        assert_eq!(result.total_regions, 0);
    }

    #[test]
    fn a_region_over_unchanged_pixels_contributes_nothing() {
        let a = make_solid_image(64, 64, 10, 20, 30);
        let result = interpret_regions(&a, &a, &[bbox(8, 8, 16, 16)]).unwrap();
        assert_eq!(result.diff_count, 0);
        assert_eq!(result.diff_percentage, 0.0);
    }

    #[test]
    fn a_changed_region_is_classified() {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);

        let result = interpret_regions(&a, &b, &[bbox(16, 16, 8, 8)]).unwrap();
        assert_eq!(result.total_regions, 1);
        assert_eq!(result.diff_count, 64);
        assert_eq!(result.regions[0].bbox, bbox(16, 16, 8, 8));
    }

    /// The point of the regions-in API: a producer that only knows a coarse
    /// box still gets per-pixel counts, because the mask is refined against the
    /// source pixels before anything is measured.
    #[test]
    fn a_coarse_region_still_yields_per_pixel_counts() {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);

        let exact = interpret_regions(&a, &b, &[bbox(16, 16, 8, 8)]).unwrap();
        // Quantized to a 16px grid, as an SSIM window map would give.
        let coarse = interpret_regions(&a, &b, &[bbox(16, 16, 16, 16)]).unwrap();

        assert_eq!(coarse.diff_count, exact.diff_count);
        assert_eq!(coarse.regions[0].pixel_count, exact.regions[0].pixel_count);
    }

    #[test]
    fn mismatched_sizes_are_rejected() {
        let a = make_solid_image(64, 64, 0, 0, 0);
        let b = make_solid_image(32, 64, 0, 0, 0);
        assert!(matches!(
            interpret_regions(&a, &b, &[]),
            Err(InterpretError::SizeMismatch { .. })
        ));
    }

    #[test]
    fn an_out_of_bounds_region_is_rejected_rather_than_panicking() {
        let a = make_solid_image(64, 64, 0, 0, 0);
        for out in [
            bbox(60, 0, 8, 8),
            bbox(0, 60, 8, 8),
            bbox(u32::MAX, 0, 8, 8),
        ] {
            assert!(
                matches!(
                    interpret_regions(&a, &a, &[out]),
                    Err(InterpretError::RegionOutOfBounds { .. })
                ),
                "{out:?} should be rejected"
            );
        }
    }
}

/// Turn a lower-resolution scalar score map into regions in image coordinates.
///
/// This is how a similarity metric becomes a region producer: threshold its
/// local map at `floor`, take connected components at map resolution, then
/// scale each box back up. The result is deliberately coarse — a box is only
/// ever as precise as the map's grid — but [`interpret_regions`] refines
/// against the source pixels before measuring anything, so the statistics it
/// derives are still per-pixel.
///
/// Scores are "higher is more similar", matching `blazediff-ssim`, so a cell
/// counts as changed when it falls *below* `floor`. `NaN` cells count as
/// changed: `ms-ssim` with product pooling yields `NaN` on globally
/// anticorrelated content, which is emphatically not a match.
pub fn regions_from_score_map(
    map: &[f32],
    map_width: usize,
    map_height: usize,
    width: u32,
    height: u32,
    floor: f32,
) -> Vec<BoundingBox> {
    if map_width == 0 || map_height == 0 || width == 0 || height == 0 {
        return Vec::new();
    }
    if map.len() < map_width * map_height {
        return Vec::new();
    }

    let changed: Vec<bool> = map[..map_width * map_height]
        .iter()
        .map(|score| !(*score >= floor))
        .collect();

    // Map cell `m` covers image pixels [m * size / map_size, (m + 1) * size / map_size).
    let scale_lo =
        |m: u32, size: u32, map_size: u32| (m as u64 * size as u64 / map_size as u64) as u32;
    let scale_hi = |m: u32, size: u32, map_size: u32| {
        let hi = (m as u64 * size as u64).div_ceil(map_size as u64) as u32;
        hi.min(size)
    };

    detect_regions(&changed, map_width as u32, map_height as u32)
        .into_iter()
        .filter_map(|component| {
            let bbox = component.bbox;
            let x = scale_lo(bbox.x, width, map_width as u32);
            let y = scale_lo(bbox.y, height, map_height as u32);
            let right = scale_hi(bbox.x + bbox.width, width, map_width as u32);
            let bottom = scale_hi(bbox.y + bbox.height, height, map_height as u32);
            // A map cell can scale to zero pixels when the map is larger than
            // the image, which `ssim`'s 'valid' convolution never produces but
            // a caller-supplied map might.
            (right > x && bottom > y).then_some(BoundingBox {
                x,
                y,
                width: right - x,
                height: bottom - y,
            })
        })
        .collect()
}

#[cfg(test)]
mod score_map_tests {
    use super::*;

    #[test]
    fn an_all_similar_map_yields_no_regions() {
        let map = vec![1.0f32; 4 * 4];
        assert!(regions_from_score_map(&map, 4, 4, 64, 64, 0.99).is_empty());
    }

    #[test]
    fn a_low_cell_becomes_a_scaled_box() {
        let mut map = vec![1.0f32; 4 * 4];
        map[5] = 0.1; // cell (1, 1) of a 4x4 map over a 64x64 image
        let regions = regions_from_score_map(&map, 4, 4, 64, 64, 0.99);
        assert_eq!(
            regions,
            vec![BoundingBox {
                x: 16,
                y: 16,
                width: 16,
                height: 16
            }]
        );
    }

    #[test]
    fn adjacent_cells_merge_into_one_region() {
        let mut map = vec![1.0f32; 4 * 4];
        map[5] = 0.1;
        map[6] = 0.1;
        let regions = regions_from_score_map(&map, 4, 4, 64, 64, 0.99);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].width, 32);
    }

    #[test]
    fn nan_counts_as_changed() {
        let mut map = vec![1.0f32; 4 * 4];
        map[0] = f32::NAN;
        assert_eq!(regions_from_score_map(&map, 4, 4, 64, 64, 0.99).len(), 1);
    }

    #[test]
    fn a_degenerate_map_yields_nothing() {
        assert!(regions_from_score_map(&[], 0, 0, 64, 64, 0.99).is_empty());
        assert!(regions_from_score_map(&[0.0], 4, 4, 64, 64, 0.99).is_empty());
    }
}
