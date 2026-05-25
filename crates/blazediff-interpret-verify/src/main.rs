mod manifest;
mod matching;
mod metrics;
mod report;
mod runner;
mod types;

use std::collections::BTreeMap;

use clap::Parser;
use metrics::build_metrics;
use report::{evaluate_gates, load_baseline, normalize_label_floor, GateConfig};
use runner::run_validation;
use types::{EvaluationMode, OutputFormat};

#[derive(Parser)]
#[command(
    name = "blazediff-interpret-verify",
    about = "Verify blazediff interpret classification in classifier-only or end-to-end mode"
)]
struct Args {
    /// Path to dataset manifest (JSON)
    #[arg(long)]
    manifest: String,

    /// Verification mode
    #[arg(long, value_enum, default_value = "classifier-only")]
    mode: EvaluationMode,

    /// IoU threshold for end-to-end bbox matching
    #[arg(long, default_value = "0.3")]
    iou_threshold: f64,

    /// Output format
    #[arg(long, value_enum, default_value = "text")]
    output_format: OutputFormat,

    /// Diff threshold passed to interpret() in end-to-end mode
    #[arg(long, default_value = "0.1")]
    threshold: f64,

    /// Min pixel count for end-to-end predictions
    #[arg(long, default_value = "0")]
    min_pixels: u32,

    /// Max cases to run (0 = all)
    #[arg(long, default_value = "0")]
    limit: usize,

    /// Optional macro F1 floor
    #[arg(long)]
    macro_f1_floor: Option<f64>,

    /// Optional per-class F1 floors, repeatable, example: --class-f1-floor Addition=0.90
    #[arg(long)]
    class_f1_floor: Vec<String>,

    /// Optional baseline JSON report from a previous run
    #[arg(long)]
    baseline_report: Option<String>,

    /// Optional max allowed macro F1 drop versus baseline
    #[arg(long)]
    max_macro_f1_drop: Option<f64>,

    /// Optional max allowed class F1 drops, repeatable, example: --max-class-f1-drop Shift=0.02
    #[arg(long)]
    max_class_f1_drop: Vec<String>,
}

fn parse_floor_map(values: &[String]) -> Result<BTreeMap<String, f64>, String> {
    let mut map = BTreeMap::new();
    for value in values {
        let (label, score) = normalize_label_floor(value)?;
        map.insert(label, score);
    }
    Ok(map)
}

fn main() {
    let args = Args::parse();

    let mut cases = match manifest::load_manifest(&args.manifest) {
        Ok(cases) => cases,
        Err(e) => {
            eprintln!("Failed to load manifest: {e}");
            std::process::exit(1);
        }
    };

    if args.limit > 0 {
        cases.truncate(args.limit);
    }
    if cases.is_empty() {
        eprintln!("No validation cases to run.");
        std::process::exit(1);
    }

    let class_f1_floors = match parse_floor_map(&args.class_f1_floor) {
        Ok(map) => map,
        Err(e) => {
            eprintln!("Failed to parse --class-f1-floor: {e}");
            std::process::exit(1);
        }
    };
    let max_class_f1_drop = match parse_floor_map(&args.max_class_f1_drop) {
        Ok(map) => map,
        Err(e) => {
            eprintln!("Failed to parse --max-class-f1-drop: {e}");
            std::process::exit(1);
        }
    };

    let baseline = match &args.baseline_report {
        Some(path) => match load_baseline(path) {
            Ok(report) => Some(report),
            Err(e) => {
                eprintln!("Failed to load baseline report: {e}");
                std::process::exit(1);
            }
        },
        None => None,
    };

    eprintln!("Running {} cases in {:?} mode...", cases.len(), args.mode);

    let options = blazediff::types::DiffOptions {
        threshold: args.threshold,
        ..Default::default()
    };

    let results = run_validation(
        cases,
        &options,
        args.mode,
        args.iou_threshold,
        args.min_pixels,
    );
    let metrics = build_metrics(&results);
    let gate = evaluate_gates(
        &metrics,
        baseline.as_ref(),
        &GateConfig {
            macro_f1_floor: args.macro_f1_floor,
            class_f1_floors,
            max_macro_f1_drop: args.max_macro_f1_drop,
            max_class_f1_drop,
        },
    );

    report::print_report(args.mode, &metrics, &gate, args.output_format);

    if !gate.passed {
        std::process::exit(1);
    }
}
