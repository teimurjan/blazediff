//! BlazeDiff CLI - High-performance image diffing tool
//!
//! Usage:
//!   blazediff <image1> <image2> [diff] [options]
//!
//! Supports PNG and JPEG formats (auto-detected by extension).
//!
//! Exit codes:
//!   0 - Images identical (within threshold)
//!   1 - Images differ
//!   2 - Error

use blazediff::{
    diff, load_jpeg, load_jpegs, load_png, load_pngs, save_jpeg, save_png_with_compression,
    DiffError, DiffOptions, Image,
};
use clap::Parser;
use rayon::prelude::*;
use serde::Serialize;
use std::path::Path;
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

    /// Output format (json or text)
    #[arg(long, default_value = "json")]
    output_format: String,

    /// PNG compression level (0=fastest/largest, 9=slowest/smallest)
    #[arg(short = 'c', long, default_value = "0")]
    compression: u8,

    /// JPEG quality (1-100, default 90)
    #[arg(short = 'q', long, default_value = "90")]
    quality: u8,
}

/// Supported image formats
#[derive(Debug, Clone, Copy, PartialEq)]
enum ImageFormat {
    Png,
    Jpeg,
}

impl ImageFormat {
    fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(ImageFormat::Png),
            "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
            _ => None,
        }
    }
}

/// Load a single image, auto-detecting format
#[allow(dead_code)]
fn load_image<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    let format = ImageFormat::from_path(&path).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!(
            "Unsupported format: {}",
            path.as_ref().display()
        ))
    })?;
    match format {
        ImageFormat::Png => load_png(path),
        ImageFormat::Jpeg => load_jpeg(path),
    }
}

/// Load two images in parallel, auto-detecting format
fn load_images<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    let fmt1 = ImageFormat::from_path(&path1).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path1.as_ref().display()))
    })?;
    let fmt2 = ImageFormat::from_path(&path2).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path2.as_ref().display()))
    })?;

    // If both are same format, use optimized parallel loader
    if fmt1 == fmt2 {
        return match fmt1 {
            ImageFormat::Png => load_pngs(&path1, &path2),
            ImageFormat::Jpeg => load_jpegs(&path1, &path2),
        };
    }

    // Mixed formats: load in parallel anyway
    let results: Vec<Result<Image, DiffError>> = [
        (path1.as_ref().to_path_buf(), fmt1),
        (path2.as_ref().to_path_buf(), fmt2),
    ]
    .par_iter()
    .map(|(path, fmt)| match fmt {
        ImageFormat::Png => load_png(path),
        ImageFormat::Jpeg => load_jpeg(path),
    })
    .collect();

    let mut iter = results.into_iter();
    Ok((iter.next().unwrap()?, iter.next().unwrap()?))
}

/// Save an image, auto-detecting format from extension
fn save_image<P: AsRef<Path>>(image: &Image, path: P, args: &Args) -> Result<(), DiffError> {
    let format = ImageFormat::from_path(&path).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path.as_ref().display()))
    })?;
    match format {
        ImageFormat::Png => save_png_with_compression(image, path, args.compression),
        ImageFormat::Jpeg => save_jpeg(image, path, args.quality),
    }
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

    let (img1, img2) = match load_images(&args.image1, &args.image2) {
        Ok(imgs) => imgs,
        Err(e) => {
            output_error(&args, &format!("Failed to load images: {}", e));
            return ExitCode::from(2);
        }
    };

    // Check for size mismatch - can't diff images of different sizes
    if img1.width != img2.width || img1.height != img2.height {
        output_error(
            &args,
            &format!(
                "Layout differs: {}x{} vs {}x{}",
                img1.width, img1.height, img2.width, img2.height
            ),
        );
        return ExitCode::from(1);
    }

    let options = DiffOptions {
        threshold: args.threshold,
        include_aa: !args.antialiasing,
        diff_mask: args.diff_mask,
        compression: args.compression,
        ..Default::default()
    };

    let mut output_image = if args.output.is_some() {
        Some(Image::new_uninit(img1.width, img1.height))
    } else {
        None
    };

    let result = match diff(&img1, &img2, output_image.as_mut(), &options) {
        Ok(r) => r,
        Err(e) => {
            output_error(&args, &format!("Diff failed: {}", e));
            return ExitCode::from(2);
        }
    };

    if !result.identical {
        if let (Some(ref output_path), Some(ref output)) = (&args.output, &output_image) {
            if let Err(e) = save_image(output, output_path, &args) {
                output_error(&args, &format!("Failed to save {}: {}", output_path, e));
                return ExitCode::from(2);
            }
        }
    }

    output_result(&args, &result);

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
