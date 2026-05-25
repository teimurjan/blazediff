use std::collections::BTreeMap;

use serde::Serialize;

use crate::metrics::{parse_label, type_label, MetricsSummary, TYPE_LABELS};
use crate::types::{BaselineReport, EvaluationMode, OutputFormat};

#[derive(Clone)]
pub struct GateConfig {
    pub macro_f1_floor: Option<f64>,
    pub class_f1_floors: BTreeMap<String, f64>,
    pub max_macro_f1_drop: Option<f64>,
    pub max_class_f1_drop: BTreeMap<String, f64>,
}

#[derive(Serialize)]
pub struct GateEvaluation {
    pub passed: bool,
    pub reasons: Vec<String>,
    pub macro_f1_delta: Option<f64>,
    pub class_f1_deltas: BTreeMap<String, f64>,
}

pub fn load_baseline(path: &str) -> Result<BaselineReport, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("read baseline report: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("parse baseline report: {e}"))
}

pub fn evaluate_gates(
    metrics: &MetricsSummary,
    baseline: Option<&BaselineReport>,
    config: &GateConfig,
) -> GateEvaluation {
    let mut reasons = Vec::new();
    let mut class_f1_deltas = BTreeMap::new();

    if let Some(floor) = config.macro_f1_floor {
        if metrics.macro_f1 < floor {
            reasons.push(format!(
                "macro F1 {:.3} fell below floor {:.3}",
                metrics.macro_f1, floor
            ));
        }
    }

    for metric in &metrics.per_class {
        if let Some(floor) = config.class_f1_floors.get(&metric.label) {
            if metric.f1 < *floor {
                reasons.push(format!(
                    "{} F1 {:.3} fell below floor {:.3}",
                    metric.label, metric.f1, floor
                ));
            }
        }
    }

    let mut macro_f1_delta = None;
    if let Some(baseline) = baseline {
        macro_f1_delta = Some(metrics.macro_f1 - baseline.macro_f1);
        if let Some(max_drop) = config.max_macro_f1_drop {
            if baseline.macro_f1 - metrics.macro_f1 > max_drop {
                reasons.push(format!(
                    "macro F1 drop {:.3} exceeded tolerance {:.3}",
                    baseline.macro_f1 - metrics.macro_f1,
                    max_drop
                ));
            }
        }

        let baseline_map: BTreeMap<_, _> = baseline
            .per_class
            .iter()
            .map(|metric| (metric.label.as_str(), metric.f1))
            .collect();
        for metric in &metrics.per_class {
            if let Some(previous) = baseline_map.get(metric.label.as_str()) {
                let delta = metric.f1 - previous;
                class_f1_deltas.insert(metric.label.clone(), delta);
                if let Some(max_drop) = config.max_class_f1_drop.get(&metric.label) {
                    if previous - metric.f1 > *max_drop {
                        reasons.push(format!(
                            "{} F1 drop {:.3} exceeded tolerance {:.3}",
                            metric.label,
                            previous - metric.f1,
                            max_drop
                        ));
                    }
                }
            }
        }
    }

    GateEvaluation {
        passed: reasons.is_empty(),
        reasons,
        macro_f1_delta,
        class_f1_deltas,
    }
}

pub fn normalize_label_floor(value: &str) -> Result<(String, f64), String> {
    let (label, score) = value
        .split_once('=')
        .ok_or_else(|| format!("invalid label floor '{value}', expected Label=0.75"))?;
    let parsed = parse_label(label).ok_or_else(|| {
        format!(
            "unknown label '{label}', expected one of {}",
            TYPE_LABELS.join(", ")
        )
    })?;
    let threshold = score
        .parse::<f64>()
        .map_err(|e| format!("invalid score in '{value}': {e}"))?;
    Ok((type_label(parsed).to_string(), threshold))
}

pub fn print_report(
    mode: EvaluationMode,
    metrics: &MetricsSummary,
    gate: &GateEvaluation,
    format: OutputFormat,
) {
    match format {
        OutputFormat::Json => print_json(mode, metrics, gate),
        OutputFormat::Text => print_text(mode, metrics, gate),
    }
}

fn print_json(mode: EvaluationMode, metrics: &MetricsSummary, gate: &GateEvaluation) {
    #[derive(Serialize)]
    struct JsonReport<'a> {
        mode: EvaluationMode,
        total_cases: usize,
        total_regions: u32,
        total_correct: u32,
        detection_misses: u32,
        detection_extras: u32,
        classification_errors: u32,
        macro_f1: f64,
        weighted_f1: f64,
        per_class: &'a [crate::metrics::ClassMetrics],
        confusion_matrix: &'a [[u32; 6]; 6],
        false_negatives: &'a [u32; 6],
        false_positives: &'a [u32; 6],
        tiers: &'a BTreeMap<String, usize>,
        worst_confusions: &'a [crate::metrics::ConfusionPair],
        failures: &'a [crate::types::FailureDetail],
        gate: &'a GateEvaluation,
    }

    let report = JsonReport {
        mode,
        total_cases: metrics.total_cases,
        total_regions: metrics.total_regions,
        total_correct: metrics.total_correct,
        detection_misses: metrics.detection_misses,
        detection_extras: metrics.detection_extras,
        classification_errors: metrics.classification_errors,
        macro_f1: metrics.macro_f1,
        weighted_f1: metrics.weighted_f1,
        per_class: &metrics.per_class,
        confusion_matrix: &metrics.confusion_matrix.matrix,
        false_negatives: &metrics.confusion_matrix.fn_counts,
        false_positives: &metrics.confusion_matrix.fp_counts,
        tiers: &metrics.tiers,
        worst_confusions: &metrics.worst_confusions,
        failures: &metrics.failures,
        gate,
    };

    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}

fn print_text(mode: EvaluationMode, metrics: &MetricsSummary, gate: &GateEvaluation) {
    println!("=== Interpret Verification Report ===");
    println!("Mode: {:?}", mode);
    println!("Cases: {}", metrics.total_cases);
    println!(
        "Regions: {} total, {} correct",
        metrics.total_regions, metrics.total_correct
    );
    println!(
        "Detection misses: {}, extras: {}, classification errors: {}",
        metrics.detection_misses, metrics.detection_extras, metrics.classification_errors
    );
    println!("Macro F1: {:.3}", metrics.macro_f1);
    println!("Weighted F1: {:.3}", metrics.weighted_f1);
    println!();

    println!("Tiers:");
    for (tier, count) in &metrics.tiers {
        println!("  {tier}: {count}");
    }
    println!();

    println!("Per-class metrics:");
    println!(
        "{:>16}  {:>8}  {:>8}  {:>8}  {:>8}",
        "", "Prec", "Recall", "F1", "Support"
    );
    for metric in &metrics.per_class {
        println!(
            "{:>16}  {:>8.3}  {:>8.3}  {:>8.3}  {:>8}",
            metric.label, metric.precision, metric.recall, metric.f1, metric.support
        );
    }
    println!();

    println!("Confusion Matrix (rows=actual, cols=predicted):");
    print!("{:>16}", "");
    for label in &TYPE_LABELS {
        print!("{:>16}", label);
    }
    println!("{:>12}", "(miss)");
    for (row, label) in TYPE_LABELS.iter().enumerate() {
        print!("{:>16}", label);
        for col in 0..TYPE_LABELS.len() {
            print!("{:>16}", metrics.confusion_matrix.matrix[row][col]);
        }
        println!("{:>12}", metrics.confusion_matrix.fn_counts[row]);
    }
    print!("{:>16}", "(extra)");
    for col in 0..TYPE_LABELS.len() {
        print!("{:>16}", metrics.confusion_matrix.fp_counts[col]);
    }
    println!();
    println!();

    if !metrics.worst_confusions.is_empty() {
        println!("Worst confusions:");
        for pair in &metrics.worst_confusions {
            println!("  {} -> {}: {}", pair.expected, pair.predicted, pair.count);
        }
        println!();
    }

    if !metrics.failures.is_empty() {
        println!("Hardest failures:");
        for failure in metrics.failures.iter().take(20) {
            println!(
                "  {} [{}]: expected {:?}, predicted {:?}, region {:?}, pair {:?}, tags {:?}, IoU {:?}, confidence {:?}, signals {:?}",
                failure.case_name,
                failure.failure_kind,
                failure.expected,
                failure.predicted,
                failure.gt_region_id,
                failure.pair_id,
                failure.tags,
                failure.iou,
                failure.confidence,
                failure.signals
            );
        }
        println!();
    }

    println!("Gate: {}", if gate.passed { "pass" } else { "fail" });
    if let Some(delta) = gate.macro_f1_delta {
        println!("Baseline macro F1 delta: {delta:.3}");
    }
    for (label, delta) in &gate.class_f1_deltas {
        println!("Baseline {} F1 delta: {:.3}", label, delta);
    }
    if !gate.reasons.is_empty() {
        println!("Gate reasons:");
        for reason in &gate.reasons {
            println!("  {reason}");
        }
    }
}
