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

    /// Optional JSONL dump of every match/extra/miss with full region stats,
    /// for offline signal analysis
    #[arg(long)]
    dump_regions: Option<String>,
}

fn dump_regions(path: &str, results: &[types::CaseResult]) -> std::io::Result<()> {
    use std::io::Write;
    let file = std::fs::File::create(path)?;
    let mut out = std::io::BufWriter::new(file);
    for result in results {
        let base = serde_json::json!({
            "case": result.case_name,
            "image_width": result.image_width,
            "image_height": result.image_height,
        });
        for matched in &result.matches {
            let mut row = base.clone();
            let obj = row.as_object_mut().unwrap();
            obj.insert("kind".into(), "match".into());
            obj.insert(
                "expected".into(),
                serde_json::to_value(matched.expected_type).unwrap(),
            );
            obj.insert(
                "predicted".into(),
                serde_json::to_value(matched.predicted_type).unwrap(),
            );
            obj.insert("gt_region_id".into(), matched.gt_region_id.clone().into());
            obj.insert(
                "gt_bbox".into(),
                serde_json::to_value(matched.gt_bbox).unwrap(),
            );
            obj.insert("iou".into(), serde_json::to_value(matched.iou).unwrap());
            obj.insert(
                "pair_id".into(),
                serde_json::to_value(&matched.pair_id).unwrap(),
            );
            obj.insert("tags".into(), serde_json::to_value(&matched.tags).unwrap());
            obj.insert(
                "region".into(),
                serde_json::to_value(&matched.region).unwrap(),
            );
            writeln!(out, "{row}")?;
        }
        for prediction in &result.unmatched_predictions {
            let mut row = base.clone();
            let obj = row.as_object_mut().unwrap();
            obj.insert("kind".into(), "extra".into());
            obj.insert(
                "predicted".into(),
                serde_json::to_value(prediction.change_type).unwrap(),
            );
            obj.insert("region".into(), serde_json::to_value(prediction).unwrap());
            writeln!(out, "{row}")?;
        }
        for gt in &result.unmatched_ground_truth {
            let mut row = base.clone();
            let obj = row.as_object_mut().unwrap();
            obj.insert("kind".into(), "miss".into());
            obj.insert(
                "expected".into(),
                serde_json::to_value(gt.expected_type).unwrap(),
            );
            obj.insert("gt_region_id".into(), gt.id.clone().into());
            obj.insert("gt_bbox".into(), serde_json::to_value(gt.bbox).unwrap());
            obj.insert("pair_id".into(), serde_json::to_value(&gt.pair_id).unwrap());
            obj.insert("tags".into(), serde_json::to_value(&gt.tags).unwrap());
            writeln!(out, "{row}")?;
        }
    }
    out.flush()
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
    if let Some(path) = &args.dump_regions {
        if let Err(e) = dump_regions(path, &results) {
            eprintln!("Failed to write --dump-regions file: {e}");
            std::process::exit(1);
        }
    }

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
