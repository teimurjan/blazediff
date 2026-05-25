use blazediff::interpret::{classify_regions, interpret};
use blazediff::types::DiffOptions;

use crate::matching::match_case;
use crate::types::{CaseResult, EvaluationMode, RegionMatch, ValidationCase};

fn build_case_mask(case: &ValidationCase) -> Vec<bool> {
    let width = case.img1.width;
    let height = case.img1.height;
    let mut mask = vec![false; (width * height) as usize];

    for gt in &case.ground_truth {
        if let Some(region_mask) = &gt.mask {
            for (idx, value) in region_mask.iter().enumerate() {
                if *value {
                    mask[idx] = true;
                }
            }
            continue;
        }

        for y in gt.bbox.y..gt.bbox.y + gt.bbox.height {
            for x in gt.bbox.x..gt.bbox.x + gt.bbox.width {
                mask[(y * width + x) as usize] = true;
            }
        }
    }

    mask
}

fn run_classifier_only(case: &ValidationCase) -> CaseResult {
    let mask = build_case_mask(case);
    let bboxes: Vec<_> = case.ground_truth.iter().map(|gt| gt.bbox).collect();
    let predictions = classify_regions(&case.img1, &case.img2, &mask, &bboxes);

    let matches = case
        .ground_truth
        .iter()
        .zip(predictions.iter())
        .map(|(gt, prediction)| RegionMatch {
            gt_region_id: gt.id.clone(),
            expected_type: gt.expected_type,
            predicted_type: prediction.change_type,
            source_type: gt.source_type,
            iou: Some(1.0),
            gt_bbox: gt.bbox,
            predicted_bbox: Some(prediction.bbox),
            signals: Some(prediction.signals),
            confidence: Some(prediction.confidence),
            pair_id: gt.pair_id.clone(),
            tags: gt.tags.clone(),
        })
        .collect();

    CaseResult {
        case_name: case.name.clone(),
        tier: case.tier,
        case_tags: case.tags.clone(),
        matches,
        unmatched_predictions: Vec::new(),
        unmatched_ground_truth: Vec::new(),
    }
}

fn run_end_to_end(
    case: &ValidationCase,
    options: &DiffOptions,
    iou_threshold: f64,
    min_pixels: u32,
) -> CaseResult {
    let result = interpret(&case.img1, &case.img2, options)
        .unwrap_or_else(|e| panic!("interpret failed on case '{}': {e}", case.name));

    let predictions = if min_pixels > 0 {
        result
            .regions
            .into_iter()
            .filter(|region| region.pixel_count >= min_pixels)
            .collect()
    } else {
        result.regions
    };

    match_case(case, &predictions, iou_threshold)
}

pub fn run_validation(
    cases: Vec<ValidationCase>,
    options: &DiffOptions,
    mode: EvaluationMode,
    iou_threshold: f64,
    min_pixels: u32,
) -> Vec<CaseResult> {
    cases
        .iter()
        .map(|case| match mode {
            EvaluationMode::ClassifierOnly => run_classifier_only(case),
            EvaluationMode::EndToEnd => run_end_to_end(case, options, iou_threshold, min_pixels),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DatasetTier, GroundTruthRegion, ValidationCase};
    use blazediff::interpret::types::{BoundingBox, ChangeType};
    use blazediff::types::Image;

    fn solid(width: u32, height: u32, r: u8, g: u8, b: u8) -> Image {
        let mut img = Image::new(width, height);
        for idx in 0..(width * height) as usize {
            let pos = idx * 4;
            img.data[pos] = r;
            img.data[pos + 1] = g;
            img.data[pos + 2] = b;
            img.data[pos + 3] = 255;
        }
        img
    }

    fn set_pixel(img: &mut Image, x: u32, y: u32, r: u8, g: u8, b: u8) {
        let pos = ((y * img.width + x) * 4) as usize;
        img.data[pos] = r;
        img.data[pos + 1] = g;
        img.data[pos + 2] = b;
        img.data[pos + 3] = 255;
    }

    fn fill(img: &mut Image, x: u32, y: u32, w: u32, h: u32, r: u8, g: u8, b: u8) {
        for yy in y..y + h {
            for xx in x..x + w {
                set_pixel(img, xx, yy, r, g, b);
            }
        }
    }

    fn copy_image(source: &Image) -> Image {
        let mut out = Image::new(source.width, source.height);
        out.data.copy_from_slice(&source.data);
        out
    }

    fn gt(
        id: &str,
        source: ChangeType,
        expected: ChangeType,
        bbox: BoundingBox,
    ) -> GroundTruthRegion {
        GroundTruthRegion {
            id: id.to_string(),
            source_type: source,
            expected_type: expected,
            bbox,
            mask: None,
            pair_id: None,
            tags: Vec::new(),
            expect_in_output: true,
        }
    }

    fn case(
        name: &str,
        img1: Image,
        img2: Image,
        ground_truth: Vec<GroundTruthRegion>,
    ) -> ValidationCase {
        ValidationCase {
            name: name.to_string(),
            img1,
            img2,
            tier: DatasetTier::Gate,
            tags: Vec::new(),
            ground_truth,
        }
    }

    #[test]
    fn classifier_only_covers_all_six_labels() {
        let bbox = BoundingBox {
            x: 6,
            y: 6,
            width: 8,
            height: 8,
        };

        let base = solid(20, 20, 240, 240, 240);

        let mut addition_after = copy_image(&base);
        fill(&mut addition_after, 6, 6, 8, 8, 220, 20, 20);
        let addition_case = case(
            "addition",
            copy_image(&base),
            addition_after,
            vec![gt("add", ChangeType::Addition, ChangeType::Addition, bbox)],
        );

        let mut deletion_before = copy_image(&base);
        fill(&mut deletion_before, 6, 6, 8, 8, 220, 20, 20);
        let deletion_case = case(
            "deletion",
            deletion_before,
            copy_image(&base),
            vec![gt("del", ChangeType::Deletion, ChangeType::Deletion, bbox)],
        );

        let mut color_before = copy_image(&base);
        let mut color_after = copy_image(&base);
        fill(&mut color_before, 6, 6, 8, 8, 220, 20, 20);
        fill(&mut color_after, 6, 6, 8, 8, 20, 20, 220);
        let color_case = case(
            "color",
            color_before,
            color_after,
            vec![gt(
                "color",
                ChangeType::ColorChange,
                ChangeType::ColorChange,
                bbox,
            )],
        );

        let mut content_before = copy_image(&base);
        let mut content_after = copy_image(&base);
        fill(&mut content_before, 6, 6, 8, 8, 220, 20, 20);
        for y in 6..14 {
            for x in 6..14 {
                let pixel = if (x + y) % 2 == 0 {
                    (20, 20, 220)
                } else {
                    (235, 235, 40)
                };
                set_pixel(&mut content_after, x, y, pixel.0, pixel.1, pixel.2);
            }
        }
        let content_case = case(
            "content",
            content_before,
            content_after,
            vec![gt(
                "content",
                ChangeType::ContentChange,
                ChangeType::ContentChange,
                bbox,
            )],
        );

        let mut noise_after = copy_image(&base);
        set_pixel(&mut noise_after, 10, 10, 245, 245, 245);
        let noise_case = case(
            "noise",
            copy_image(&base),
            noise_after,
            vec![gt(
                "noise",
                ChangeType::RenderingNoise,
                ChangeType::RenderingNoise,
                BoundingBox {
                    x: 10,
                    y: 10,
                    width: 1,
                    height: 1,
                },
            )],
        );

        let mut shift_before = copy_image(&base);
        let mut shift_after = copy_image(&base);
        fill(&mut shift_before, 2, 6, 5, 5, 220, 20, 20);
        fill(&mut shift_after, 12, 6, 5, 5, 220, 20, 20);
        let shift_case = case(
            "shift",
            shift_before,
            shift_after,
            vec![
                GroundTruthRegion {
                    id: "shift-a".to_string(),
                    source_type: ChangeType::Deletion,
                    expected_type: ChangeType::Shift,
                    bbox: BoundingBox {
                        x: 2,
                        y: 6,
                        width: 5,
                        height: 5,
                    },
                    mask: None,
                    pair_id: Some("pair-1".to_string()),
                    tags: Vec::new(),
                    expect_in_output: true,
                },
                GroundTruthRegion {
                    id: "shift-b".to_string(),
                    source_type: ChangeType::Addition,
                    expected_type: ChangeType::Shift,
                    bbox: BoundingBox {
                        x: 12,
                        y: 6,
                        width: 5,
                        height: 5,
                    },
                    mask: None,
                    pair_id: Some("pair-1".to_string()),
                    tags: Vec::new(),
                    expect_in_output: true,
                },
            ],
        );

        let results = run_validation(
            vec![
                addition_case,
                deletion_case,
                color_case,
                content_case,
                noise_case,
                shift_case,
            ],
            &DiffOptions::default(),
            EvaluationMode::ClassifierOnly,
            0.3,
            0,
        );

        let predicted: Vec<_> = results
            .iter()
            .flat_map(|result| result.matches.iter().map(|matched| matched.predicted_type))
            .collect();
        assert!(predicted.contains(&ChangeType::Addition));
        assert!(predicted.contains(&ChangeType::Deletion));
        assert!(predicted.contains(&ChangeType::ColorChange));
        assert!(predicted.contains(&ChangeType::ContentChange));
        assert!(predicted.contains(&ChangeType::RenderingNoise));
        assert_eq!(
            predicted
                .iter()
                .filter(|&&kind| kind == ChangeType::Shift)
                .count(),
            2
        );
    }
}
