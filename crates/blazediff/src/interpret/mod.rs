//! Deterministic image diff analysis.
//!
//! Wraps `blazediff::diff()` to produce structured, human/agent-readable results:
//! region detection via connected-component labeling, spatial positions, severity,
//! color delta analysis, gradient scoring, and semantic interpretation.

mod color_delta;
mod content_analysis;
mod gradient;
pub mod html_report;
mod interpretation;
mod region;
mod severity;
mod shape;
mod spatial;
#[cfg(test)]
pub(crate) mod test_helpers;
pub mod types;

use crate::diff::diff;
use crate::types::{DiffError, DiffOptions, Image};
use color_delta::compute_color_delta;
use content_analysis::{analyze_content, luminance_stats};
use gradient::compute_gradient_stats;
use interpretation::classify_change_type;
use region::{detect_regions, extract_change_mask};
use severity::classify_severity;
use shape::{classify_shape, compute_shape_stats};
use spatial::classify_position;
use types::{ChangeRegion, ChangeType, InterpretResult};

/// Run a diff and interpret the results into structured regions with spatial positions,
/// severity, color deltas, gradient scoring, and semantic interpretation.
pub fn interpret(
    img1: &Image,
    img2: &Image,
    options: &DiffOptions,
) -> Result<InterpretResult, DiffError> {
    let width = img1.width;
    let height = img1.height;
    let total_pixels = (width * height) as f64;

    let mut output = Image::new(width, height);
    // Force alpha=0 so unchanged pixels are pure grayscale — the change mask
    // relies on R!=G||R!=B to detect changed pixels, and any original-color
    // bleed would cause false positives.
    let mask_options = DiffOptions {
        alpha: 0.0,
        ..*options
    };
    let diff_result = diff(img1, img2, Some(&mut output), &mask_options)?;

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

    let mask = extract_change_mask(&output.data, width, height);
    let components = detect_regions(&mask, width, height);

    let mut regions: Vec<ChangeRegion> = components
        .into_iter()
        .map(|c| {
            let percentage = if total_pixels > 0.0 {
                100.0 * c.pixel_count as f64 / total_pixels
            } else {
                0.0
            };
            let shape_stats = compute_shape_stats(&mask, width, &c.bbox, c.pixel_count);
            let shape = classify_shape(&shape_stats);
            let position = classify_position(&c.bbox, width, height);

            let color_delta = compute_color_delta(img1, img2, &mask, &c.bbox, width);
            let gradient_stats = compute_gradient_stats(img1, img2, &mask, &c.bbox, width, height);
            let content = analyze_content(img1, img2, &mask, &c.bbox, width, height);
            let (change_type, signals) = classify_change_type(
                &content,
                &color_delta,
                &gradient_stats,
                &shape_stats,
                &c.bbox,
            );

            ChangeRegion {
                bbox: c.bbox,
                pixel_count: c.pixel_count,
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
        })
        .collect();

    detect_shifts(&mut regions, img1, img2, &mask, width);

    // Drop RenderingNoise — not actionable, clutters output
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

/// Post-classification pass: match Addition+Deletion pairs with similar
/// content to reclassify as Shift.
fn detect_shifts(
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

fn build_summary(
    regions: &[ChangeRegion],
    severity: &types::ChangeSeverity,
    diff_percentage: f64,
) -> String {
    use std::collections::BTreeMap;
    use types::SpatialPosition;

    let region_word = if regions.len() == 1 {
        "region"
    } else {
        "regions"
    };
    let severity_label = match severity {
        types::ChangeSeverity::Low => "Low-impact",
        types::ChangeSeverity::Medium => "Moderate",
        types::ChangeSeverity::High => "Significant",
    };

    let mut lines = vec![format!(
        "{severity_label} visual change detected ({diff_percentage:.2}% of image, {count} {region_word}).",
        count = regions.len(),
    )];

    // Group by change type, preserving order of first occurrence via BTreeMap on discriminant
    let mut groups: BTreeMap<u8, (ChangeType, usize, Vec<SpatialPosition>)> = BTreeMap::new();
    let type_order = |ct: &ChangeType| -> u8 {
        match ct {
            ChangeType::ContentChange => 0,
            ChangeType::Addition => 1,
            ChangeType::Deletion => 2,
            ChangeType::Shift => 3,
            ChangeType::ColorChange => 4,
            ChangeType::RenderingNoise => 5,
        }
    };

    for r in regions {
        let key = type_order(&r.change_type);
        let entry = groups
            .entry(key)
            .or_insert_with(|| (r.change_type, 0, Vec::new()));
        entry.1 += 1;
        if !entry.2.contains(&r.position) {
            entry.2.push(r.position);
        }
    }

    for (_, (change_type, count, positions)) in &groups {
        let label = match change_type {
            ChangeType::ContentChange => "Content changed",
            ChangeType::Addition => "Content added",
            ChangeType::Deletion => "Content removed",
            ChangeType::Shift => "Content shifted",
            ChangeType::ColorChange => "Colors changed",
            ChangeType::RenderingNoise => "Rendering noise",
        };
        let rw = if *count == 1 { "region" } else { "regions" };
        let pos_str: Vec<String> = positions.iter().map(|p| p.to_string()).collect();
        lines.push(format!("{label}: {count} {rw} ({}).", pos_str.join(", ")));
    }

    lines.join("\n")
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
    fn test_single_pixel_addition() {
        // Red pixel on grey background → changed pixel blends with bg in img1, stands out in img2
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        set_pixel(&mut img2, 50, 50, 255, 0, 0);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].pixel_count, 1);
        assert_eq!(result.regions[0].position, SpatialPosition::Center);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    #[test]
    fn test_block_addition() {
        // Red block added on grey background
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
        // Red block removed (present in img1, background in img2)
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
        // Both should be additions (new content on uniform background)
        assert!(result
            .regions
            .iter()
            .all(|r| r.change_type == ChangeType::Addition));
    }

    #[test]
    fn test_full_image_color_change() {
        // Full image black→white: no background reference, low edge → ColorChange
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
        // Hollow rectangle drawn on uniform background → Addition
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
        // Sparse subtle grid pattern — very low color delta
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

        // RenderingNoise is filtered out; remaining regions (if any) should be Addition
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
        // Dark rectangle moves from one position to another (non-overlapping)
        let mut img1 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 20, 20, 40, 40, 40);

        let mut img2 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img2, 60, 60, 20, 20, 40, 40, 40);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 2);
        // Both regions should be reclassified as Shift
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
        // Block on uniform bg → blends with bg in img1
        assert!(region.signals.blends_with_bg_in_img1);
    }

    #[test]
    fn test_grey_shift_is_addition() {
        // Grey 128→220 on uniform grey: pixel was background, now stands out → Addition
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 220, 220, 220);

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    // --- Shift detection algorithm tests ---

    #[test]
    fn test_shift_not_detected_for_different_sizes() {
        // Two blocks of very different sizes → should NOT match as shift
        let mut img1 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 40, 40, 40, 40, 40); // large block

        let mut img2 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img2, 140, 10, 10, 10, 40, 40, 40); // small block

        let result = interpret(&img1, &img2, &DiffOptions::default()).unwrap();

        // Size ratio 40/10 = 4.0, well outside 0.6-1.67 → no shift
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
        // Same-sized blocks but very different content → no shift
        let mut img1 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img1, 10, 10, 30, 30, 20, 20, 20); // very dark

        let mut img2 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img2, 140, 10, 30, 30, 200, 50, 50); // red, much brighter

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
        // Two additions, no deletions → no shift possible
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
        // Same object location in both images but different color → should be ColorChange or ContentChange, not Add/Del
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
