use crate::metrics::{ConfusionMatrix, TYPE_LABELS};
use crate::types::{CaseResult, OutputFormat};

pub fn print_report(results: &[CaseResult], matrix: &ConfusionMatrix, format: OutputFormat) {
    match format {
        OutputFormat::Json => print_json(results, matrix),
        OutputFormat::Text => print_text(results, matrix),
    }
}

fn print_json(results: &[CaseResult], matrix: &ConfusionMatrix) {
    #[derive(serde::Serialize)]
    struct JsonReport<'a> {
        total_cases: usize,
        total_correct: u32,
        total_regions: u32,
        macro_f1: f64,
        weighted_f1: f64,
        per_class: Vec<crate::metrics::ClassMetrics>,
        confusion_matrix: &'a [[u32; 6]; 6],
        misclassified: Vec<MisCase>,
    }
    #[derive(serde::Serialize)]
    struct MisCase {
        case: String,
        expected: String,
        predicted: String,
        iou: f64,
    }

    let mut misclassified = Vec::new();
    for r in results {
        for m in &r.matches {
            if m.ground_truth_type != m.predicted_type {
                misclassified.push(MisCase {
                    case: r.case_name.clone(),
                    expected: format!("{}", m.ground_truth_type),
                    predicted: format!("{}", m.predicted_type),
                    iou: m.iou,
                });
            }
        }
    }

    let report = JsonReport {
        total_cases: results.len(),
        total_correct: matrix.total_correct(),
        total_regions: matrix.total_regions(),
        macro_f1: matrix.macro_f1(),
        weighted_f1: matrix.weighted_f1(),
        per_class: matrix.per_class_metrics(),
        confusion_matrix: &matrix.matrix,
        misclassified,
    };

    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}

fn print_text(results: &[CaseResult], matrix: &ConfusionMatrix) {
    println!("=== Interpret Validation Report ===");
    println!("Cases: {}", results.len());
    println!(
        "Regions: {} total, {} correct",
        matrix.total_regions(),
        matrix.total_correct()
    );
    println!();

    // Confusion matrix
    println!("Confusion Matrix (rows=actual, cols=predicted):");
    print!("{:>10}", "");
    for label in &TYPE_LABELS {
        print!("{:>9}", label);
    }
    println!("{:>9}", "(miss)");

    for (i, label) in TYPE_LABELS.iter().enumerate() {
        print!("{:>10}", label);
        for j in 0..6 {
            print!("{:>9}", matrix.matrix[i][j]);
        }
        print!("{:>9}", matrix.fn_counts[i]);
        println!();
    }
    print!("{:>10}", "(extra)");
    for j in 0..6 {
        print!("{:>9}", matrix.fp_counts[j]);
    }
    println!();
    println!();

    // Per-class metrics
    println!("Per-class metrics:");
    println!(
        "{:>10}  {:>8}  {:>8}  {:>8}  {:>8}",
        "", "Prec", "Recall", "F1", "Support"
    );
    for m in matrix.per_class_metrics() {
        println!(
            "{:>10}  {:>8.3}  {:>8.3}  {:>8.3}  {:>8}",
            m.label, m.precision, m.recall, m.f1, m.support
        );
    }
    println!();
    println!("Macro F1:    {:.3}", matrix.macro_f1());
    println!("Weighted F1: {:.3}", matrix.weighted_f1());

    // Misclassified / unmatched
    let has_issues = results.iter().any(|r| {
        r.matches
            .iter()
            .any(|m| m.ground_truth_type != m.predicted_type)
            || !r.unmatched_ground_truth.is_empty()
            || !r.unmatched_predictions.is_empty()
    });

    if has_issues {
        println!();
        println!("Issues:");
        for r in results {
            for m in &r.matches {
                if m.ground_truth_type != m.predicted_type {
                    println!(
                        "  - {}: expected {}, got {} (IoU={:.2})",
                        r.case_name, m.ground_truth_type, m.predicted_type, m.iou
                    );
                }
            }
            for gt in &r.unmatched_ground_truth {
                println!(
                    "  - {}: expected {}, no matching prediction",
                    r.case_name, gt.change_type
                );
            }
            for p in &r.unmatched_predictions {
                println!(
                    "  - {}: unexpected {} prediction",
                    r.case_name, p.change_type
                );
            }
        }
    }
}
