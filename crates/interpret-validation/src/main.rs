mod manifest;
mod matching;
mod metrics;
mod report;
mod runner;
mod types;

use clap::Parser;
use types::OutputFormat;

#[derive(Parser)]
#[command(
    name = "interpret-validation",
    about = "Validate blazediff interpret module against real datasets"
)]
struct Args {
    /// Path to dataset manifest (JSON). Generate with scripts/prepare_*.py
    #[arg(long)]
    manifest: String,

    /// IoU threshold for bbox matching
    #[arg(long, default_value = "0.3")]
    iou_threshold: f64,

    /// Output format: text or json
    #[arg(long, default_value = "text")]
    output_format: String,

    /// Diff threshold passed to interpret()
    #[arg(long, default_value = "0.1")]
    threshold: f64,

    /// Min pixel count for predictions (filters noise regions)
    #[arg(long, default_value = "0")]
    min_pixels: u32,

    /// Max cases to run (0 = all)
    #[arg(long, default_value = "0")]
    limit: usize,
}

fn main() {
    let args = Args::parse();

    let format = match args.output_format.as_str() {
        "json" => OutputFormat::Json,
        _ => OutputFormat::Text,
    };

    let cases = match manifest::load_manifest(&args.manifest) {
        Ok(mut cases) => {
            if args.limit > 0 {
                cases.truncate(args.limit);
            }
            cases
        }
        Err(e) => {
            eprintln!("Failed to load manifest: {e}");
            std::process::exit(1);
        }
    };

    if cases.is_empty() {
        eprintln!("No validation cases to run.");
        std::process::exit(1);
    }

    eprintln!("Running {} cases...", cases.len());

    let options = blazediff::types::DiffOptions {
        threshold: args.threshold,
        ..Default::default()
    };

    let results = runner::run_validation(cases, &options, args.iou_threshold, args.min_pixels);
    let matrix = metrics::build_confusion_matrix(&results);

    report::print_report(&results, &matrix, format);
}
