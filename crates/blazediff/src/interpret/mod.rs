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
#[cfg(test)]
pub(crate) mod test_helpers;
pub mod types;

use crate::diff::diff;
use crate::types::{DiffError, DiffOptions, Image};
use crate::yiq::color_delta_f32;
use color_delta::compute_color_delta;
use content_analysis::analyze_content;
use gradient::{compute_gradient_stats, compute_luminance_ncc};
use interpretation::classify_change_type;
use region::{detect_regions, extract_change_mask};
use severity::classify_severity;
use shape::{classify_shape, compute_shape_stats};
use shifts::detect_shifts;
use spatial::classify_position;
use summary::build_summary;
use types::{ChangeRegion, ChangeType, InterpretResult};

/// YIQ squared-delta floor for treating a pixel as actually changed.
/// 100.0 corresponds to a YIQ-weighted distance of 10, roughly equivalent to
/// a perceptual delta of ~0.017 — filters near-identical pixels without
/// throwing away genuine edits.
const REFINE_DELTA_FLOOR_SQ: f32 = 100.0;

const MASK_DIFF_COLOR: [u8; 3] = [255, 0, 0];
const MASK_DIFF_COLOR_ALT: [u8; 3] = [0, 0, 255];
const MASK_AA_COLOR: [u8; 3] = [255, 255, 0];

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
                let delta = color_delta_f32(pixels1[idx], pixels2[idx]).abs();
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

fn recolor_output(output: &mut Image, options: &DiffOptions) {
    let diff_color_alt = options.diff_color_alt.unwrap_or(options.diff_color);

    for pixel in output.data.chunks_exact_mut(4) {
        let color = match [pixel[0], pixel[1], pixel[2]] {
            MASK_DIFF_COLOR => options.diff_color,
            MASK_DIFF_COLOR_ALT => diff_color_alt,
            MASK_AA_COLOR => options.aa_color,
            _ => continue,
        };
        pixel[..3].copy_from_slice(&color);
    }
}

/// Run a diff once, optionally retain its visualization, and interpret the
/// results into structured regions.
pub fn interpret_with_output(
    img1: &Image,
    img2: &Image,
    mut output: Option<&mut Image>,
    options: &DiffOptions,
) -> Result<InterpretResult, DiffError> {
    let width = img1.width;
    let height = img1.height;
    let total_pixels = (width * height) as f64;

    let retain_output = output.is_some();
    let mut internal_output = Image::new_uninit(width, height);
    let diff_output = output.as_deref_mut().unwrap_or(&mut internal_output);

    // Stable non-grayscale marker colors keep mask extraction independent of
    // caller-selected colors, including grayscale alternatives.
    let mask_options = DiffOptions {
        aa_color: MASK_AA_COLOR,
        diff_color: MASK_DIFF_COLOR,
        diff_color_alt: Some(MASK_DIFF_COLOR_ALT),
        ..options.clone()
    };
    let diff_result = diff(img1, img2, Some(diff_output), &mask_options)?;

    if diff_result.identical {
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

    let mask = extract_change_mask(&diff_output.data, width, height);
    if retain_output {
        recolor_output(diff_output, options);
    }
    let components = detect_regions(&mask, width, height);
    let mut regions: Vec<ChangeRegion> = components
        .into_iter()
        .map(|c| {
            let mut region = classify_region_with_mask(img1, img2, &mask, c.bbox);
            region.pixel_count = c.pixel_count;
            region.percentage = if total_pixels > 0.0 {
                100.0 * c.pixel_count as f64 / total_pixels
            } else {
                0.0
            };
            region
        })
        .collect();

    detect_shifts(&mut regions, img1, img2, &mask, width);

    regions.retain(|r| r.change_type != ChangeType::RenderingNoise);

    let severity = classify_severity(diff_result.diff_percentage);
    let summary = build_summary(&regions, &severity, diff_result.diff_percentage);

    Ok(InterpretResult {
        summary,
        diff_count: diff_result.diff_count,
        total_regions: regions.len(),
        regions,
        severity,
        diff_percentage: diff_result.diff_percentage,
        width,
        height,
    })
}

/// Run a diff and interpret the results into structured regions with spatial positions,
/// severity, color deltas, gradient scoring, and semantic interpretation.
pub fn interpret(
    img1: &Image,
    img2: &Image,
    options: &DiffOptions,
) -> Result<InterpretResult, DiffError> {
    interpret_with_output(img1, img2, None, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::interpret::test_helpers::*;
    use types::*;

    #[test]
    fn test_identical_images() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let img2 = make_solid_image(100, 100, 128, 128, 128);
        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 0);
        assert!(result.regions.is_empty());
        assert_eq!(result.severity, ChangeSeverity::Low);
        assert_eq!(result.diff_percentage, 0.0);
        assert_eq!(result.summary, "Images are identical");
    }

    #[test]
    fn test_single_pixel_change_is_filtered_as_noise() {
        // Subtle single-pixel deltas sit below interpret()'s noise floor, so
        // they don't show up as actionable regions.
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        set_pixel(&mut img2, 50, 50, 130, 130, 130);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 0);
        assert!(result.regions.is_empty());
    }

    #[test]
    fn test_interpret_with_output_matches_diff() {
        let img1 = make_solid_image(32, 32, 200, 200, 200);
        let img2 = make_solid_image(32, 32, 50, 50, 50);
        let options = DiffOptions {
            include_aa: true,
            diff_color_alt: Some([0, 128, 255]),
            ..Default::default()
        };
        let mut expected = Image::new(32, 32);
        let diff_result = diff(&img1, &img2, Some(&mut expected), &options).unwrap();
        let mut actual = Image::new(32, 32);

        let interpretation =
            interpret_with_output(&img1, &img2, Some(&mut actual), &options).unwrap();

        assert_eq!(interpretation.diff_count, diff_result.diff_count);
        assert_eq!(actual.data, expected.data);
    }

    #[test]
    fn test_interpret_with_grayscale_alt_color_keeps_regions() {
        let img1 = make_solid_image(32, 32, 200, 200, 200);
        let img2 = make_solid_image(32, 32, 50, 50, 50);
        let options = DiffOptions {
            include_aa: true,
            diff_color_alt: Some([32, 32, 32]),
            ..Default::default()
        };
        let mut output = Image::new(32, 32);

        let result = interpret_with_output(&img1, &img2, Some(&mut output), &options).unwrap();

        assert_eq!(result.diff_count, 32 * 32);
        assert!(result.total_regions > 0);
        assert_eq!(&output.data[..4], &[32, 32, 32, 255]);
    }

    #[test]
    fn test_block_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 255, 0, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].position, SpatialPosition::TopLeft);
        assert_eq!(result.severity, ChangeSeverity::High);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
        assert!(result.summary.contains("Content added"));
    }

    #[test]
    fn test_block_deletion() {
        let mut img1 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img1, 0, 0, 40, 40, 255, 0, 0);
        let img2 = make_solid_image(100, 100, 128, 128, 128);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].change_type, ChangeType::Deletion);
        assert!(result.summary.contains("Content removed"));
    }

    #[test]
    fn test_scattered_additions() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);
        fill_block(&mut img2, 80, 80, 10, 10, 0, 255, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 2);
        let positions: Vec<SpatialPosition> = result.regions.iter().map(|r| r.position).collect();
        assert!(positions.contains(&SpatialPosition::TopLeft));
        assert!(positions.contains(&SpatialPosition::BottomRight));
        assert!(result
            .regions
            .iter()
            .all(|r| r.change_type == ChangeType::Addition));
    }

    #[test]
    fn test_full_image_color_change() {
        let img1 = make_solid_image(100, 100, 0, 0, 0);
        let img2 = make_solid_image(100, 100, 255, 255, 255);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.severity, ChangeSeverity::High);
        assert!(result.diff_percentage > 90.0);
        assert_eq!(result.regions[0].shape, ChangeShape::SolidRegion);
        assert!(
            matches!(
                result.regions[0].change_type,
                ChangeType::ColorChange | ChangeType::ContentChange
            ),
            "Expected ColorChange or ContentChange for full image swap, got: {:?}",
            result.regions[0].change_type
        );
    }

    #[test]
    fn test_severity_boundaries() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);

        let mut img2_low = make_solid_image(100, 100, 128, 128, 128);
        for i in 0..50 {
            set_pixel(&mut img2_low, i % 100, i / 100, 255, 0, 0);
        }
        let result_low = interpret(&img1, &img2_low, &DiffOptions::default()).unwrap();
        assert_eq!(result_low.severity, ChangeSeverity::Low);

        let mut img2_med = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2_med, 0, 0, 20, 25, 255, 0, 0);
        let result_med = interpret(&img1, &img2_med, &DiffOptions::default()).unwrap();
        assert_eq!(result_med.severity, ChangeSeverity::Medium);

        let mut img2_high = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2_high, 0, 0, 50, 50, 255, 0, 0);
        let result_high = interpret(&img1, &img2_high, &DiffOptions::default()).unwrap();
        assert_eq!(result_high.severity, ChangeSeverity::High);
    }

    #[test]
    fn test_json_roundtrip() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 10, 10, 20, 20, 255, 0, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: InterpretResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result, deserialized);
    }

    #[test]
    fn test_hollow_frame_is_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);

        let bx = 35u32;
        let by = 35u32;
        let bw = 30u32;
        let bh = 30u32;
        for y in by..by + bh {
            for x in bx..bx + bw {
                if x == bx || x == bx + bw - 1 || y == by || y == by + bh - 1 {
                    set_pixel(&mut img2, x, y, 255, 0, 0);
                }
            }
        }

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].shape, ChangeShape::ContourFrame);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    #[test]
    fn test_sparse_noise() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);

        let bx = 10u32;
        let by = 10u32;
        let size = 80u32;
        for y in (by..by + size).step_by(6) {
            for x in bx..bx + size {
                set_pixel(&mut img2, x, y, 133, 133, 133);
            }
        }
        for x in (bx..bx + size).step_by(6) {
            for y in by..by + size {
                set_pixel(&mut img2, x, y, 133, 133, 133);
            }
        }

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        for r in &result.regions {
            assert_eq!(
                r.change_type,
                ChangeType::Addition,
                "Expected Addition for sparse subtle grid, got: {:?}",
                r.change_type
            );
        }
    }

    #[test]
    fn test_shift_detection() {
        let mut img1 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 20, 20, 40, 40, 40);

        let mut img2 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img2, 60, 60, 20, 20, 40, 40, 40);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 2);
        assert!(
            result
                .regions
                .iter()
                .all(|r| r.change_type == ChangeType::Shift),
            "Expected both regions as Shift, got: {:?}",
            result
                .regions
                .iter()
                .map(|r| r.change_type)
                .collect::<Vec<_>>()
        );
        assert!(result.summary.contains("Content shifted"));
    }

    #[test]
    fn test_size_mismatch_error() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let img2 = make_solid_image(200, 200, 128, 128, 128);

        let result = interpret(&img1, &img2, &DiffOptions::default());
        assert!(result.is_err());
    }

    #[test]
    fn test_summary_format() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);
        fill_block(&mut img2, 80, 80, 10, 10, 0, 255, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert!(result.summary.contains("visual change detected"));
        assert!(result.summary.contains("2 regions"));
    }

    #[test]
    fn test_summary_has_descriptions() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert!(result.summary.contains("region"));
        assert!(result.summary.lines().count() >= 2);
    }

    #[test]
    fn test_signals_populated() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 255, 0, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        let region = &result.regions[0];
        assert!(region.confidence > 0.0);
        assert!(region.signals.blends_with_bg_in_img1);
    }

    #[test]
    fn test_grey_shift_is_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 220, 220, 220);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    #[test]
    fn test_shift_not_detected_for_different_sizes() {
        let mut img1 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 40, 40, 40, 40, 40);

        let mut img2 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img2, 140, 10, 10, 10, 40, 40, 40);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Different-sized blocks should not be detected as shift"
        );
    }

    #[test]
    fn test_shift_not_detected_for_different_luminance() {
        let mut img1 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img1, 10, 10, 30, 30, 20, 20, 20);

        let mut img2 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img2, 140, 10, 30, 30, 200, 50, 50);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Blocks with different luminance should not be shift"
        );
    }

    #[test]
    fn test_no_shift_when_only_additions() {
        let img1 = make_solid_image(200, 100, 200, 200, 200);
        let mut img2 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img2, 10, 10, 30, 30, 40, 40, 40);
        fill_block(&mut img2, 140, 10, 30, 30, 40, 40, 40);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Two additions with no deletion cannot form a shift"
        );
    }

    #[test]
    fn test_object_on_both_images_is_not_addition_or_deletion() {
        let mut img1 = make_solid_image(100, 100, 200, 200, 200);
        fill_block(&mut img1, 30, 30, 40, 40, 255, 0, 0);
        let mut img2 = make_solid_image(100, 100, 200, 200, 200);
        fill_block(&mut img2, 30, 30, 40, 40, 0, 0, 255);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        for r in &result.regions {
            assert!(
                r.change_type != ChangeType::Addition && r.change_type != ChangeType::Deletion,
                "Object present in both images should not be Addition or Deletion, got {:?}",
                r.change_type
            );
        }
    }
}
