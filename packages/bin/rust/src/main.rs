//! BlazeDiff CLI - High-performance image diffing tool
//!
//! Usage:
//!   blazediff <image1.png> <image2.png> [diff.png] [options]
//!
//! Exit codes:
//!   0 - Images identical (within threshold)
//!   1 - Images differ
//!   2 - Error

use blazediff::{diff, load_two_pngs, save_png, DiffOptions, Image};
use clap::Parser;
use serde::Serialize;
use std::process::ExitCode;

#[derive(Parser, Debug)]
#[command(name = "blazediff")]
#[command(author = "Teimur Gasanov")]
#[command(version = "0.1.0")]
#[command(about = "High-performance image diffing with block-based optimization and SIMD")]
struct Args {
    /// First image path
    #[arg(index = 1)]
    image1: String,

    /// Second image path
    #[arg(index = 2)]
    image2: String,

    /// Output diff image path (optional - if not provided, no diff image is saved)
    #[arg(index = 3)]
    output: Option<String>,

    /// Color difference threshold (0.0-1.0)
    #[arg(short, long, default_value = "0.1")]
    threshold: f64,

    /// Enable anti-aliasing detection
    #[arg(short, long)]
    antialiasing: bool,

    /// Output only differences (transparent background)
    #[arg(long)]
    diff_mask: bool,

    /// Fail on layout (size) difference
    #[arg(long)]
    fail_on_layout: bool,

    /// Output format (json or text)
    #[arg(long, default_value = "json")]
    output_format: String,
}

#[derive(Serialize)]
struct JsonOutput {
    #[serde(rename = "diffCount")]
    diff_count: u32,
    #[serde(rename = "diffPercentage")]
    diff_percentage: f64,
    identical: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn main() -> ExitCode {
    let args = Args::parse();

    // Load images in parallel (like odiff's loadTwoImages)
    let (img1, img2) = match load_two_pngs(&args.image1, &args.image2) {
        Ok(imgs) => imgs,
        Err(e) => {
            output_error(&args, &format!("Failed to load images: {}", e));
            return ExitCode::from(2);
        }
    };

    // Check for layout difference if required
    if args.fail_on_layout && (img1.width != img2.width || img1.height != img2.height) {
        output_error(
            &args,
            &format!(
                "Layout differs: {}x{} vs {}x{}",
                img1.width, img1.height, img2.width, img2.height
            ),
        );
        return ExitCode::from(1);
    }

    // Configure options
    let options = DiffOptions {
        threshold: args.threshold,
        include_aa: !args.antialiasing,
        diff_mask: args.diff_mask,
        ..Default::default()
    };

    // Create output image only if output path is provided
    let mut output_image = if args.output.is_some() {
        Some(Image::new(img1.width, img1.height))
    } else {
        None
    };

    // Run diff
    let result = match diff(&img1, &img2, output_image.as_mut(), &options) {
        Ok(r) => r,
        Err(e) => {
            output_error(&args, &format!("Diff failed: {}", e));
            return ExitCode::from(2);
        }
    };

    // Save output image only if there are differences (like odiff)
    if !result.identical {
        if let (Some(ref output_path), Some(ref output)) = (&args.output, &output_image) {
            if let Err(e) = save_png(output, output_path) {
                output_error(&args, &format!("Failed to save {}: {}", output_path, e));
                return ExitCode::from(2);
            }
        }
    }

    // Output result
    output_result(&args, &result);

    // Return appropriate exit code
    if result.identical {
        ExitCode::from(0)
    } else {
        ExitCode::from(1)
    }
}

fn output_result(args: &Args, result: &blazediff::DiffResult) {
    if args.output_format == "json" {
        let json = JsonOutput {
            diff_count: result.diff_count,
            diff_percentage: result.diff_percentage,
            identical: result.identical,
            error: None,
        };
        println!("{}", serde_json::to_string(&json).unwrap());
    } else {
        println!("Diff count: {}", result.diff_count);
        println!("Diff percentage: {:.4}%", result.diff_percentage);
        println!("Identical: {}", result.identical);
    }
}

fn output_error(args: &Args, message: &str) {
    if args.output_format == "json" {
        let json = JsonOutput {
            diff_count: 0,
            diff_percentage: 0.0,
            identical: false,
            error: Some(message.to_string()),
        };
        eprintln!("{}", serde_json::to_string(&json).unwrap());
    } else {
        eprintln!("Error: {}", message);
    }
}
