use blazediff::interpret::types::{BoundingBox, ChangeRegion};

use crate::types::{GroundTruthRegion, RegionMatch, ValidationCase};

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

pub fn match_regions(
    predictions: &[ChangeRegion],
    ground_truth: &[GroundTruthRegion],
    iou_threshold: f64,
) -> (Vec<RegionMatch>, Vec<usize>, Vec<usize>) {
    let mut matches = Vec::new();
    let mut matched_pred = vec![false; predictions.len()];
    let mut matched_gt = vec![false; ground_truth.len()];

    let mut pairs: Vec<(usize, usize, bool, f64)> = Vec::new();
    for (gi, gt) in ground_truth.iter().enumerate() {
        for (pi, pred) in predictions.iter().enumerate() {
            let score = iou(&gt.bbox, &pred.bbox);
            if score >= iou_threshold {
                pairs.push((gi, pi, gt.expected_type == pred.change_type, score));
            }
        }
    }
    pairs.sort_by(|a, b| {
        b.2.cmp(&a.2)
            .then_with(|| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal))
    });

    for (gi, pi, _, score) in pairs {
        if matched_gt[gi] || matched_pred[pi] {
            continue;
        }
        matched_gt[gi] = true;
        matched_pred[pi] = true;
        matches.push(RegionMatch {
            gt_region_id: ground_truth[gi].id.clone(),
            expected_type: ground_truth[gi].expected_type,
            predicted_type: predictions[pi].change_type,
            source_type: ground_truth[gi].source_type,
            iou: Some(score),
            gt_bbox: ground_truth[gi].bbox,
            predicted_bbox: Some(predictions[pi].bbox),
            signals: Some(predictions[pi].signals),
            confidence: Some(predictions[pi].confidence),
            pair_id: ground_truth[gi].pair_id.clone(),
            tags: ground_truth[gi].tags.clone(),
        });
    }

    let unmatched_pred: Vec<usize> = matched_pred
        .iter()
        .enumerate()
        .filter(|(_, matched)| !**matched)
        .map(|(idx, _)| idx)
        .collect();
    let unmatched_gt: Vec<usize> = matched_gt
        .iter()
        .enumerate()
        .filter(|(_, matched)| !**matched)
        .map(|(idx, _)| idx)
        .collect();

    (matches, unmatched_pred, unmatched_gt)
}

pub fn match_case(
    case: &ValidationCase,
    predictions: &[ChangeRegion],
    iou_threshold: f64,
) -> crate::types::CaseResult {
    let mut resolved_matches = Vec::new();
    let mut eligible_gt = Vec::new();

    for gt in &case.ground_truth {
        if !gt.expect_in_output {
            let overlaps = predictions
                .iter()
                .any(|prediction| iou(&gt.bbox, &prediction.bbox) >= iou_threshold);
            if !overlaps {
                resolved_matches.push(RegionMatch {
                    gt_region_id: gt.id.clone(),
                    expected_type: gt.expected_type,
                    predicted_type: gt.expected_type,
                    source_type: gt.source_type,
                    iou: Some(1.0),
                    gt_bbox: gt.bbox,
                    predicted_bbox: None,
                    signals: None,
                    confidence: None,
                    pair_id: gt.pair_id.clone(),
                    tags: gt.tags.clone(),
                });
                continue;
            }
        }
        eligible_gt.push(gt.clone());
    }

    let (mut matches, unmatched_pred_idx, unmatched_gt_idx) =
        match_regions(predictions, &eligible_gt, iou_threshold);
    resolved_matches.append(&mut matches);

    let unmatched_predictions = unmatched_pred_idx
        .into_iter()
        .map(|idx| predictions[idx].clone())
        .collect();
    let unmatched_ground_truth = unmatched_gt_idx
        .into_iter()
        .map(|idx| eligible_gt[idx].clone())
        .collect();

    crate::types::CaseResult {
        case_name: case.name.clone(),
        tier: case.tier,
        case_tags: case.tags.clone(),
        matches: resolved_matches,
        unmatched_predictions,
        unmatched_ground_truth,
    }
}
