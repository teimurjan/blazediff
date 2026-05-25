use std::collections::BTreeMap;

use blazediff::interpret::types::ChangeType;
use serde::{Deserialize, Serialize};

use crate::types::{CaseResult, FailureDetail};

const NUM_CLASSES: usize = 6;

pub const TYPE_LABELS: [&str; NUM_CLASSES] = [
    "RenderingNoise",
    "ContentChange",
    "Addition",
    "Deletion",
    "Shift",
    "ColorChange",
];

pub fn type_label(change_type: ChangeType) -> &'static str {
    TYPE_LABELS[type_index(change_type)]
}

pub fn parse_label(label: &str) -> Option<ChangeType> {
    match label {
        "RenderingNoise" => Some(ChangeType::RenderingNoise),
        "ContentChange" => Some(ChangeType::ContentChange),
        "Addition" => Some(ChangeType::Addition),
        "Deletion" => Some(ChangeType::Deletion),
        "Shift" => Some(ChangeType::Shift),
        "ColorChange" => Some(ChangeType::ColorChange),
        _ => None,
    }
}

fn type_index(ct: ChangeType) -> usize {
    match ct {
        ChangeType::RenderingNoise => 0,
        ChangeType::ContentChange => 1,
        ChangeType::Addition => 2,
        ChangeType::Deletion => 3,
        ChangeType::Shift => 4,
        ChangeType::ColorChange => 5,
    }
}

#[derive(Serialize)]
pub struct ConfusionMatrix {
    pub matrix: [[u32; NUM_CLASSES]; NUM_CLASSES],
    pub fn_counts: [u32; NUM_CLASSES],
    pub fp_counts: [u32; NUM_CLASSES],
}

#[derive(Serialize, Clone, Deserialize)]
pub struct ClassMetrics {
    pub label: String,
    pub precision: f64,
    pub recall: f64,
    pub f1: f64,
    pub support: u32,
}

#[derive(Serialize)]
pub struct ConfusionPair {
    pub expected: String,
    pub predicted: String,
    pub count: u32,
}

#[derive(Serialize)]
pub struct MetricsSummary {
    pub total_cases: usize,
    pub total_regions: u32,
    pub total_correct: u32,
    pub detection_misses: u32,
    pub detection_extras: u32,
    pub classification_errors: u32,
    pub macro_f1: f64,
    pub weighted_f1: f64,
    pub per_class: Vec<ClassMetrics>,
    pub confusion_matrix: ConfusionMatrix,
    pub worst_confusions: Vec<ConfusionPair>,
    pub tiers: BTreeMap<String, usize>,
    pub failures: Vec<FailureDetail>,
}

impl ConfusionMatrix {
    pub fn new() -> Self {
        Self {
            matrix: [[0; NUM_CLASSES]; NUM_CLASSES],
            fn_counts: [0; NUM_CLASSES],
            fp_counts: [0; NUM_CLASSES],
        }
    }

    pub fn record(&mut self, actual: ChangeType, predicted: ChangeType) {
        self.matrix[type_index(actual)][type_index(predicted)] += 1;
    }

    pub fn record_false_negative(&mut self, actual: ChangeType) {
        self.fn_counts[type_index(actual)] += 1;
    }

    pub fn record_false_positive(&mut self, predicted: ChangeType) {
        self.fp_counts[type_index(predicted)] += 1;
    }

    fn true_positives(&self, class: usize) -> u32 {
        self.matrix[class][class]
    }

    fn total_predicted_as(&self, class: usize) -> u32 {
        let col_sum: u32 = (0..NUM_CLASSES).map(|row| self.matrix[row][class]).sum();
        col_sum + self.fp_counts[class]
    }

    fn total_actual(&self, class: usize) -> u32 {
        let row_sum: u32 = self.matrix[class].iter().sum();
        row_sum + self.fn_counts[class]
    }

    pub fn precision(&self, class: usize) -> f64 {
        let tp = self.true_positives(class) as f64;
        let total_predicted = self.total_predicted_as(class) as f64;
        if total_predicted == 0.0 {
            0.0
        } else {
            tp / total_predicted
        }
    }

    pub fn recall(&self, class: usize) -> f64 {
        let tp = self.true_positives(class) as f64;
        let total_actual = self.total_actual(class) as f64;
        if total_actual == 0.0 {
            0.0
        } else {
            tp / total_actual
        }
    }

    pub fn f1(&self, class: usize) -> f64 {
        let precision = self.precision(class);
        let recall = self.recall(class);
        if precision + recall == 0.0 {
            0.0
        } else {
            2.0 * precision * recall / (precision + recall)
        }
    }

    pub fn support(&self, class: usize) -> u32 {
        self.total_actual(class)
    }

    pub fn per_class_metrics(&self) -> Vec<ClassMetrics> {
        (0..NUM_CLASSES)
            .map(|idx| ClassMetrics {
                label: TYPE_LABELS[idx].to_string(),
                precision: self.precision(idx),
                recall: self.recall(idx),
                f1: self.f1(idx),
                support: self.support(idx),
            })
            .collect()
    }

    pub fn macro_f1(&self) -> f64 {
        let classes_with_support: Vec<usize> = (0..NUM_CLASSES)
            .filter(|idx| self.support(*idx) > 0)
            .collect();
        if classes_with_support.is_empty() {
            return 0.0;
        }
        let total: f64 = classes_with_support.iter().map(|idx| self.f1(*idx)).sum();
        total / classes_with_support.len() as f64
    }

    pub fn weighted_f1(&self) -> f64 {
        let total_support: u32 = (0..NUM_CLASSES).map(|idx| self.support(idx)).sum();
        if total_support == 0 {
            return 0.0;
        }
        let weighted_sum: f64 = (0..NUM_CLASSES)
            .map(|idx| self.f1(idx) * self.support(idx) as f64)
            .sum();
        weighted_sum / total_support as f64
    }

    pub fn total_correct(&self) -> u32 {
        (0..NUM_CLASSES).map(|idx| self.true_positives(idx)).sum()
    }

    pub fn total_regions(&self) -> u32 {
        let matrix_sum: u32 = self.matrix.iter().flat_map(|row| row.iter()).sum();
        let fn_sum: u32 = self.fn_counts.iter().sum();
        let fp_sum: u32 = self.fp_counts.iter().sum();
        matrix_sum + fn_sum + fp_sum
    }

    pub fn worst_confusions(&self, limit: usize) -> Vec<ConfusionPair> {
        let mut pairs = Vec::new();
        for actual in 0..NUM_CLASSES {
            for predicted in 0..NUM_CLASSES {
                if actual == predicted {
                    continue;
                }
                let count = self.matrix[actual][predicted];
                if count > 0 {
                    pairs.push(ConfusionPair {
                        expected: TYPE_LABELS[actual].to_string(),
                        predicted: TYPE_LABELS[predicted].to_string(),
                        count,
                    });
                }
            }
        }
        pairs.sort_by(|a, b| b.count.cmp(&a.count));
        pairs.truncate(limit);
        pairs
    }
}

pub fn build_metrics(results: &[CaseResult]) -> MetricsSummary {
    let mut matrix = ConfusionMatrix::new();
    let mut detection_misses = 0u32;
    let mut detection_extras = 0u32;
    let mut classification_errors = 0u32;
    let mut tiers = BTreeMap::new();
    let mut failures = Vec::new();

    for result in results {
        *tiers.entry(result.tier.to_string()).or_insert(0usize) += 1;

        for matched in &result.matches {
            matrix.record(matched.expected_type, matched.predicted_type);
            if matched.expected_type != matched.predicted_type {
                classification_errors += 1;
                failures.push(FailureDetail {
                    case_name: result.case_name.clone(),
                    tier: result.tier,
                    failure_kind: format!(
                        "{} -> {}",
                        type_label(matched.expected_type),
                        type_label(matched.predicted_type)
                    ),
                    gt_region_id: Some(matched.gt_region_id.clone()),
                    expected: Some(type_label(matched.expected_type).to_string()),
                    predicted: Some(type_label(matched.predicted_type).to_string()),
                    pair_id: matched.pair_id.clone(),
                    tags: matched.tags.clone(),
                    gt_bbox: Some(matched.gt_bbox),
                    predicted_bbox: matched.predicted_bbox,
                    iou: matched.iou,
                    signals: matched.signals,
                    confidence: matched.confidence,
                });
            }
        }

        for gt in &result.unmatched_ground_truth {
            matrix.record_false_negative(gt.expected_type);
            detection_misses += 1;
            failures.push(FailureDetail {
                case_name: result.case_name.clone(),
                tier: result.tier,
                failure_kind: "detection-miss".to_string(),
                gt_region_id: Some(gt.id.clone()),
                expected: Some(type_label(gt.expected_type).to_string()),
                predicted: None,
                pair_id: gt.pair_id.clone(),
                tags: gt.tags.clone(),
                gt_bbox: Some(gt.bbox),
                predicted_bbox: None,
                iou: None,
                signals: None,
                confidence: None,
            });
        }

        for prediction in &result.unmatched_predictions {
            matrix.record_false_positive(prediction.change_type);
            detection_extras += 1;
            failures.push(FailureDetail {
                case_name: result.case_name.clone(),
                tier: result.tier,
                failure_kind: "detection-extra".to_string(),
                gt_region_id: None,
                expected: None,
                predicted: Some(type_label(prediction.change_type).to_string()),
                pair_id: None,
                tags: Vec::new(),
                gt_bbox: None,
                predicted_bbox: Some(prediction.bbox),
                iou: None,
                signals: Some(prediction.signals),
                confidence: Some(prediction.confidence),
            });
        }
    }

    MetricsSummary {
        total_cases: results.len(),
        total_regions: matrix.total_regions(),
        total_correct: matrix.total_correct(),
        detection_misses,
        detection_extras,
        classification_errors,
        macro_f1: matrix.macro_f1(),
        weighted_f1: matrix.weighted_f1(),
        per_class: matrix.per_class_metrics(),
        worst_confusions: matrix.worst_confusions(10),
        confusion_matrix: matrix,
        tiers,
        failures,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CaseResult, DatasetTier, GroundTruthRegion, RegionMatch};
    use blazediff::interpret::types::{
        BoundingBox, ChangeRegion, ChangeShape, ClassificationSignals, ColorDeltaStats,
        GradientStats, ShapeStats,
    };

    fn dummy_prediction(change_type: ChangeType) -> ChangeRegion {
        ChangeRegion {
            bbox: BoundingBox {
                x: 0,
                y: 0,
                width: 4,
                height: 4,
            },
            pixel_count: 16,
            percentage: 1.0,
            position: blazediff::interpret::types::SpatialPosition::Center,
            shape: ChangeShape::SolidRegion,
            shape_stats: ShapeStats {
                fill_ratio: 1.0,
                border_ratio: 0.0,
                inner_fill_ratio: 1.0,
                center_density: 1.0,
                row_occupancy: 1.0,
                col_occupancy: 1.0,
            },
            change_type,
            signals: ClassificationSignals {
                blends_with_bg_in_img1: false,
                blends_with_bg_in_img2: false,
                low_color_delta: false,
                low_edge_change: false,
                dense_fill: true,
                sparse_fill: false,
                tiny_region: false,
                edges_correlated: false,
                luminance_ncc: 0.0,
                structure_asymmetry: 0.0,
                confidence: 0.5,
            },
            confidence: 0.5,
            color_delta: ColorDeltaStats {
                mean_delta: 0.2,
                max_delta: 0.2,
                delta_stddev: 0.1,
            },
            gradient: GradientStats {
                edge_score: 0.2,
                edge_score_img2: 0.2,
                edge_correlation: 0.4,
            },
        }
    }

    #[test]
    fn separates_detection_and_classification_failures() {
        let result = CaseResult {
            case_name: "case".to_string(),
            tier: DatasetTier::Regression,
            case_tags: Vec::new(),
            matches: vec![RegionMatch {
                gt_region_id: "gt-1".to_string(),
                expected_type: ChangeType::ColorChange,
                predicted_type: ChangeType::ContentChange,
                source_type: ChangeType::ColorChange,
                iou: Some(0.8),
                gt_bbox: BoundingBox {
                    x: 0,
                    y: 0,
                    width: 4,
                    height: 4,
                },
                predicted_bbox: Some(BoundingBox {
                    x: 0,
                    y: 0,
                    width: 4,
                    height: 4,
                }),
                signals: None,
                confidence: None,
                pair_id: None,
                tags: vec!["uniform-recolor".to_string()],
            }],
            unmatched_predictions: vec![dummy_prediction(ChangeType::Addition)],
            unmatched_ground_truth: vec![GroundTruthRegion {
                id: "gt-2".to_string(),
                source_type: ChangeType::Deletion,
                expected_type: ChangeType::Deletion,
                bbox: BoundingBox {
                    x: 5,
                    y: 5,
                    width: 4,
                    height: 4,
                },
                mask: None,
                pair_id: None,
                tags: vec!["paired-shift".to_string()],
                expect_in_output: true,
            }],
        };

        let metrics = build_metrics(&[result]);
        assert_eq!(metrics.classification_errors, 1);
        assert_eq!(metrics.detection_misses, 1);
        assert_eq!(metrics.detection_extras, 1);
        assert_eq!(metrics.worst_confusions[0].expected, "ColorChange");
        assert_eq!(metrics.worst_confusions[0].predicted, "ContentChange");
    }
}
