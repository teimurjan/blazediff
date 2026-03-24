use blazediff::interpret::types::ChangeType;
use serde::Serialize;

use crate::types::CaseResult;

const NUM_CLASSES: usize = 6;

pub const TYPE_LABELS: [&str; NUM_CLASSES] =
    ["Noise", "Content", "Addition", "Deletion", "Shift", "Color"];

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
    /// matrix[actual][predicted]
    pub matrix: [[u32; NUM_CLASSES]; NUM_CLASSES],
    /// False negatives per actual class (unmatched ground truth)
    pub fn_counts: [u32; NUM_CLASSES],
    /// False positives per predicted class (unmatched predictions)
    pub fp_counts: [u32; NUM_CLASSES],
}

#[derive(Serialize)]
pub struct ClassMetrics {
    pub label: String,
    pub precision: f64,
    pub recall: f64,
    pub f1: f64,
    pub support: u32,
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
        let col_sum: u32 = (0..NUM_CLASSES).map(|r| self.matrix[r][class]).sum();
        col_sum + self.fp_counts[class]
    }

    fn total_actual(&self, class: usize) -> u32 {
        let row_sum: u32 = self.matrix[class].iter().sum();
        row_sum + self.fn_counts[class]
    }

    pub fn precision(&self, class: usize) -> f64 {
        let tp = self.true_positives(class) as f64;
        let total_pred = self.total_predicted_as(class) as f64;
        if total_pred == 0.0 {
            0.0
        } else {
            tp / total_pred
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
        let p = self.precision(class);
        let r = self.recall(class);
        if p + r == 0.0 {
            0.0
        } else {
            2.0 * p * r / (p + r)
        }
    }

    pub fn support(&self, class: usize) -> u32 {
        self.total_actual(class)
    }

    pub fn per_class_metrics(&self) -> Vec<ClassMetrics> {
        (0..NUM_CLASSES)
            .map(|i| ClassMetrics {
                label: TYPE_LABELS[i].to_string(),
                precision: self.precision(i),
                recall: self.recall(i),
                f1: self.f1(i),
                support: self.support(i),
            })
            .collect()
    }

    pub fn macro_f1(&self) -> f64 {
        let classes_with_support: Vec<usize> =
            (0..NUM_CLASSES).filter(|&i| self.support(i) > 0).collect();
        if classes_with_support.is_empty() {
            return 0.0;
        }
        let sum: f64 = classes_with_support.iter().map(|&i| self.f1(i)).sum();
        sum / classes_with_support.len() as f64
    }

    pub fn weighted_f1(&self) -> f64 {
        let total_support: u32 = (0..NUM_CLASSES).map(|i| self.support(i)).sum();
        if total_support == 0 {
            return 0.0;
        }
        let sum: f64 = (0..NUM_CLASSES)
            .map(|i| self.f1(i) * self.support(i) as f64)
            .sum();
        sum / total_support as f64
    }

    pub fn total_correct(&self) -> u32 {
        (0..NUM_CLASSES).map(|i| self.true_positives(i)).sum()
    }

    pub fn total_regions(&self) -> u32 {
        let matrix_sum: u32 = self.matrix.iter().flat_map(|r| r.iter()).sum();
        let fn_sum: u32 = self.fn_counts.iter().sum();
        let fp_sum: u32 = self.fp_counts.iter().sum();
        matrix_sum + fn_sum + fp_sum
    }
}

pub fn build_confusion_matrix(results: &[CaseResult]) -> ConfusionMatrix {
    let mut matrix = ConfusionMatrix::new();

    for result in results {
        for m in &result.matches {
            matrix.record(m.ground_truth_type, m.predicted_type);
        }
        for gt in &result.unmatched_ground_truth {
            matrix.record_false_negative(gt.change_type);
        }
        for pred in &result.unmatched_predictions {
            matrix.record_false_positive(pred.change_type);
        }
    }

    matrix
}
