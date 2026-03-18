//! blazediff-interpret CLI - Structured image diff analysis
//!
//! Usage:
//!   blazediff-interpret <image1> <image2> [options]
//!
//! Exit codes:
//!   0 - Images identical
//!   1 - Images differ
//!   2 - Error

mod html_report;

use blazediff::DiffOptions;
use blazediff_interpret::{interpret, io::load_images};
use clap::Parser;
use std::path::Path;
use std::process::ExitCode;

#[derive(Parser, Debug)]
#[command(name = "blazediff-interpret")]
#[command(author = "Teimur Gasanov")]
#[command(version)]
#[command(about = "Structured image diff analysis: regions, positions, and severity")]
struct Args {
    /// First image path
    #[arg(index = 1)]
    image1: String,

    /// Second image path
    #[arg(index = 2)]
    image2: String,

    /// Color difference threshold (0.0-1.0)
    #[arg(short, long, default_value = "0.1")]
    threshold: f64,

    /// Enable anti-aliasing detection
    #[arg(short, long)]
    antialiasing: bool,

    /// Output format (json or text)
    #[arg(long, default_value = "json")]
    output_format: String,

    /// Output compact JSON (summary, severity, diff_percentage, compact regions)
    #[arg(long)]
    compact: bool,

    /// Write output to a file. `.html` generates an interactive report.
    #[arg(short, long)]
    output: Option<String>,
}

fn main() -> ExitCode {
    let args = Args::parse();

    let (img1, img2) = match load_images(&args.image1, &args.image2) {
        Ok(imgs) => imgs,
        Err(e) => {
            output_error(&args, &format!("Failed to load images: {e}"));
            return ExitCode::from(2);
        }
    };

    let options = DiffOptions {
        threshold: args.threshold,
        include_aa: !args.antialiasing,
        ..Default::default()
    };

    let result = match interpret(&img1, &img2, &options) {
        Ok(r) => r,
        Err(e) => {
            output_error(&args, &format!("Interpret failed: {e}"));
            return ExitCode::from(2);
        }
    };

    if let Some(output_path) = &args.output {
        let is_html = Path::new(output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("html"));

        if !is_html {
            output_error(
                &args,
                "Unsupported output path. Only `.html` output is currently supported.",
            );
            return ExitCode::from(2);
        }

        if let Err(e) =
            html_report::generate_html_report(&result, &args.image1, &args.image2, output_path)
        {
            output_error(&args, &format!("Failed to write report: {e}"));
            return ExitCode::from(2);
        }

        eprintln!("Wrote HTML report to {output_path}");
    } else if args.compact {
        println!(
            "{}",
            serde_json::to_string_pretty(&result.to_compact()).unwrap()
        );
    } else if args.output_format == "json" {
        println!("{}", serde_json::to_string_pretty(&result).unwrap());
    } else {
        println!("{}", result.summary);
    }

    if result.total_regions == 0 {
        ExitCode::from(0)
    } else {
        ExitCode::from(1)
    }
}

fn output_error(args: &Args, message: &str) {
    if args.output_format == "json" {
        eprintln!("{}", serde_json::json!({ "error": message }));
    } else {
        eprintln!("Error: {message}");
    }
}
