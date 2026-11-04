//! BlazeDiff CLI - High-performance image diffing tool
//!
//! Usage:
//!   blazediff <a> <b> [--output diff.png] [options]
//!
//! Supports PNG, JPEG, and QOI formats (auto-detected by extension).
//!
//! Exit codes:
//!   0 - Images identical (within threshold)
//!   1 - Images differ, or their dimensions do not match
//!   2 - Error

use blazediff::{
    diff_with, Background, DiffError, DiffOptions, DiffResult, Image, Metric, RenderOptions,
};
use clap::Parser;
use serde::Serialize;
use std::process::ExitCode;

#[derive(Parser, Debug)]
#[command(name = "blazediff")]
#[command(author = "Teimur Gasanov")]
#[command(version)]
#[command(about = "High-performance image diffing with block-based optimization and SIMD")]
struct Args {
    /// First image path
    #[arg(index = 1)]
    a: String,

    /// Second image path
    #[arg(index = 2)]
    b: String,

    /// Write the diff image here (only when the images differ)
    #[arg(short, long)]
    output: Option<String>,

    /// Color difference threshold (0.0-1.0)
    #[arg(short, long, default_value = "0.1")]
    threshold: f64,

    /// Detect anti-aliased pixels and leave them out of the count (default)
    #[arg(long, overrides_with = "no_antialiasing")]
    antialiasing: bool,

    /// Count anti-aliased pixels as differences
    #[arg(long, overrides_with = "antialiasing")]
    no_antialiasing: bool,

    /// Color difference metric: yiq or oklab (pixelmatch 8)
    #[arg(long, default_value = "yiq")]
    metric: Metric,

    /// Image the size of the inputs; its non-black pixels are skipped
    #[arg(long)]
    mask: Option<String>,

    /// Also report the N×N window with the most diff pixels
    #[arg(long)]
    window: Option<u32>,

    /// Opacity of the faded background (0.0-1.0)
    #[arg(short, long, default_value = "0.1")]
    alpha: f64,

    /// RGB color for differing pixels (r,g,b)
    #[arg(long, value_parser = parse_rgb)]
    diff_color: Option<[u8; 3]>,

    /// RGB color for pixels that get darker in the second image (r,g,b)
    #[arg(long, value_parser = parse_rgb)]
    diff_color_alt: Option<[u8; 3]>,

    /// RGB color for anti-aliased pixels (r,g,b)
    #[arg(long, value_parser = parse_rgb)]
    aa_color: Option<[u8; 3]>,

    /// What the diff image shows under the diff: faded or transparent
    #[arg(long, default_value = "faded")]
    background: Background,

    /// PNG compression level (0=fastest/largest, 9=slowest/smallest)
    #[arg(short = 'c', long, default_value = "0")]
    compression: u8,

    /// JPEG quality (1-100)
    #[arg(short = 'q', long, default_value = "90")]
    quality: u8,

    /// Print the result as JSON
    #[arg(long)]
    json: bool,
}

/// One byte per pixel: 1 where the mask image is not black.
fn load_mask(path: &str) -> Result<Vec<u8>, DiffError> {
    let mask = blazediff::load_image(path)?;
    Ok(mask
        .as_u32()
        .iter()
        .map(|&pixel| u8::from(pixel & 0x00FF_FFFF != 0))
        .collect())
}

fn parse_rgb(value: &str) -> Result<[u8; 3], String> {
    let channels = value
        .split(',')
        .map(str::trim)
        .map(|channel| {
            channel
                .parse::<u8>()
                .map_err(|_| format!("invalid RGB channel: {channel}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    channels
        .try_into()
        .map_err(|_| "RGB color must contain exactly three channels".to_string())
}

/// JSON for failures, printed to stderr. `io-error` names the unreadable file when known.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum Failure<'a> {
    IoError {
        #[serde(skip_serializing_if = "Option::is_none")]
        path: Option<&'a str>,
        message: String,
    },
    Error {
        message: String,
    },
}

impl Failure<'_> {
    fn message(&self) -> &str {
        match self {
            Failure::IoError { message, .. } | Failure::Error { message } => message,
        }
    }
}

fn main() -> ExitCode {
    let args = Args::parse();
    match run(&args) {
        Ok(result) => {
            print_result(&args, &result);
            if result.is_identical() {
                ExitCode::from(0)
            } else {
                ExitCode::from(1)
            }
        }
        Err(failure) => {
            if args.json {
                eprintln!("{}", serde_json::to_string(&failure).unwrap());
            } else {
                eprintln!("Error: {}", failure.message());
            }
            ExitCode::from(2)
        }
    }
}

fn run(args: &Args) -> Result<DiffResult, Failure<'_>> {
    let (a, b) = blazediff::load_image_pair(&args.a, &args.b).map_err(|e| Failure::IoError {
        path: blazediff::failing_path([&args.a, &args.b]),
        message: format!("Failed to load images: {}", e),
    })?;

    let mask = args
        .mask
        .as_deref()
        .map(load_mask)
        .transpose()
        .map_err(|e| Failure::IoError {
            path: args.mask.as_deref(),
            message: format!("Failed to load mask: {}", e),
        })?;

    let defaults = RenderOptions::default();
    let options = DiffOptions {
        threshold: args.threshold,
        antialiasing: !args.no_antialiasing,
        metric: args.metric,
        mask,
        window: args.window,
        render: RenderOptions {
            alpha: args.alpha,
            diff_color: args.diff_color.unwrap_or(defaults.diff_color),
            diff_color_alt: args.diff_color_alt,
            aa_color: args.aa_color.unwrap_or(defaults.aa_color),
            background: args.background,
        },
    };

    let mut output = args
        .output
        .as_ref()
        .map(|_| Image::new_uninit(a.width, a.height));
    let result =
        diff_with(&a, &b, output.as_mut(), &options, false).map_err(|e| Failure::Error {
            message: format!("Diff failed: {}", e),
        })?;

    if let (
        DiffResult::Compared {
            identical: false, ..
        },
        Some(path),
        Some(image),
    ) = (&result, &args.output, &output)
    {
        blazediff_shared::save_image(image, path, args.compression, args.quality).map_err(|e| {
            Failure::IoError {
                path: Some(path),
                message: format!("Failed to save {}: {}", path, e),
            }
        })?;
    }
    Ok(result)
}

fn print_result(args: &Args, result: &DiffResult) {
    if args.json {
        println!("{}", serde_json::to_string(result).unwrap());
        return;
    }
    match result {
        DiffResult::Compared {
            count,
            percentage,
            identical,
            window,
        } => {
            println!("Diff count: {}", count);
            println!("Diff percentage: {:.4}%", percentage);
            println!("Identical: {}", identical);
            if let Some(hit) = window {
                println!("Busiest window: {} at ({}, {})", hit.count, hit.x, hit.y);
            }
        }
        DiffResult::DimensionMismatch { a, b } => {
            println!(
                "Dimensions differ: {}x{} vs {}x{}",
                a.width, a.height, b.width, b.height
            );
        }
    }
}
