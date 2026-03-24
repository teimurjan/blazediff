use blazediff::interpret::types::{BoundingBox, ChangeRegion, ChangeType};

use crate::types::{CaseResult, GroundTruthRegion, RegionMatch, ValidationCase};

pub fn iou(a: &BoundingBox, b: &BoundingBox) -> f64 {
    let x_overlap = (a.x + a.width).min(b.x + b.width) as f64 - a.x.max(b.x) as f64;
    let y_overlap = (a.y + a.height).min(b.y + b.height) as f64 - a.y.max(b.y) as f64;
    if x_overlap <= 0.0 || y_overlap <= 0.0 {
        return 0.0;
    }
    let intersection = x_overlap * y_overlap;
    let area_a = a.width as f64 * a.height as f64;
    let area_b = b.width as f64 * b.height as f64;
    intersection / (area_a + area_b - intersection)
}

/// Greedy best-IoU matching between predictions and ground truth.
/// Returns matched pairs, unmatched prediction indices, and unmatched GT indices.
pub fn match_regions(
    predictions: &[ChangeRegion],
    ground_truth: &[GroundTruthRegion],
    iou_threshold: f64,
) -> (Vec<RegionMatch>, Vec<usize>, Vec<usize>) {
    let mut matches = Vec::new();
    let mut matched_pred = vec![false; predictions.len()];
    let mut matched_gt = vec![false; ground_truth.len()];

    // Build IoU matrix and sort by descending IoU
    let mut pairs: Vec<(usize, usize, f64)> = Vec::new();
    for (gi, gt) in ground_truth.iter().enumerate() {
        for (pi, pred) in predictions.iter().enumerate() {
            let score = iou(&gt.bbox, &pred.bbox);
            if score >= iou_threshold {
                pairs.push((gi, pi, score));
            }
        }
    }
    pairs.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    for (gi, pi, score) in pairs {
        if matched_gt[gi] || matched_pred[pi] {
            continue;
        }
        matched_gt[gi] = true;
        matched_pred[pi] = true;
        matches.push(RegionMatch {
            ground_truth_type: ground_truth[gi].change_type,
            predicted_type: predictions[pi].change_type,
            iou: score,
        });
    }

    let unmatched_pred: Vec<usize> = matched_pred
        .iter()
        .enumerate()
        .filter(|(_, &m)| !m)
        .map(|(i, _)| i)
        .collect();
    let unmatched_gt: Vec<usize> = matched_gt
        .iter()
        .enumerate()
        .filter(|(_, &m)| !m)
        .map(|(i, _)| i)
        .collect();

    (matches, unmatched_pred, unmatched_gt)
}

/// Handle RenderingNoise ground truth specially: absence from predictions = correct.
/// Returns case result with RenderingNoise GT handled before normal matching.
pub fn match_case(
    case: &ValidationCase,
    predictions: &[ChangeRegion],
    iou_threshold: f64,
) -> CaseResult {
    let mut noise_matches = Vec::new();
    let mut non_noise_gt: Vec<&GroundTruthRegion> = Vec::new();

    for gt in &case.ground_truth {
        if gt.change_type == ChangeType::RenderingNoise {
            // Check if any prediction overlaps this noise region
            let overlaps = predictions
                .iter()
                .any(|p| iou(&gt.bbox, &p.bbox) >= iou_threshold);
            if !overlaps {
                // Correctly filtered — TP for RenderingNoise
                noise_matches.push(RegionMatch {
                    ground_truth_type: ChangeType::RenderingNoise,
                    predicted_type: ChangeType::RenderingNoise,
                    iou: 1.0,
                });
            } else {
                // Noise leaked through — will be picked up in normal matching
                non_noise_gt.push(gt);
            }
        } else {
            non_noise_gt.push(gt);
        }
    }

    let non_noise_gt_owned: Vec<GroundTruthRegion> = non_noise_gt
        .into_iter()
        .map(|gt| GroundTruthRegion {
            change_type: gt.change_type,
            bbox: gt.bbox,
        })
        .collect();

    let (mut region_matches, unmatched_pred_idx, unmatched_gt_idx) =
        match_regions(predictions, &non_noise_gt_owned, iou_threshold);

    noise_matches.append(&mut region_matches);

    let unmatched_predictions = unmatched_pred_idx
        .into_iter()
        .map(|i| predictions[i].clone())
        .collect();
    let unmatched_ground_truth = unmatched_gt_idx
        .into_iter()
        .map(|i| GroundTruthRegion {
            change_type: non_noise_gt_owned[i].change_type,
            bbox: non_noise_gt_owned[i].bbox,
        })
        .collect();

    CaseResult {
        case_name: case.name.clone(),
        matches: noise_matches,
        unmatched_predictions,
        unmatched_ground_truth,
    }
}
