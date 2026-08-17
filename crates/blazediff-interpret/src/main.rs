//! blazediff-interpret CLI — describe what changed between two images.
//!
//! The pixel diff and the similarity metrics live in their own crates and know
//! nothing about interpretation; this binary composes them.
//!
//! Exit codes:
//!   0 - No actionable change
//!   1 - Change detected
//!   2 - Error

use blazediff::DiffOptions;
use blazediff_interpret::{interpret, interpret_diff, ChangeSource, InterpretResult};
use blazediff_shared::Image;
use blazediff_ssim::{
    hitchhikers_ssim, ms_ssim, ssim, HitchhikersOptions, MsSsimOptions, Plane, Rgba8, SsimOptions,
};
use clap::Parser;
use std::path::Path;
use std::process::ExitCode;

#[derive(Parser, Debug)]
#[command(name = "blazediff-interpret")]
#[command(author = "Teimur Gasanov")]
#[command(about = "Describe what changed between two images, not just where")]
struct Args {
    /// First image path
    image1: String,

    /// Second image path
    image2: String,

    /// Optional diff visualization output path (pixel source only)
    output: Option<String>,

    /// How to locate the changed regions: pixel, ssim, ms-ssim, hitchhikers-ssim
    #[arg(long, default_value = "pixel")]
    source: String,

    /// Color difference threshold (0.0-1.0), pixel source only
    #[arg(short, long, default_value_t = 0.1)]
    threshold: f64,

    /// Exclude anti-aliased pixels, pixel source only
    #[arg(long)]
    antialiasing: bool,

    /// Score at or below which a map window counts as changed, metric sources only
    #[arg(long, default_value_t = 0.99)]
    region_floor: f64,

    /// Emit the full result as JSON instead of a human summary
    #[arg(long)]
    json: bool,
}

fn run(args: &Args) -> Result<InterpretResult, String> {
    // Decodes both in parallel, the same helper the `blazediff` CLI and every
    // N-API binding use.
    let (image1, image2) = blazediff_shared::load_image_pair(&args.image1, &args.image2)
        .map_err(|e| format!("Failed to load images: {e}"))?;

    if args.source == "pixel" {
        let options = DiffOptions {
            threshold: args.threshold,
            include_aa: !args.antialiasing,
            ..Default::default()
        };
        let mut output = args
            .output
            .as_ref()
            .map(|_| Image::new_uninit(image1.width, image1.height));
        let result = interpret_diff(&image1, &image2, output.as_mut(), &options)
            .map_err(|e| e.to_string())?;

        if let (Some(path), Some(image)) = (&args.output, &output) {
            if result.diff_count > 0 {
                blazediff_shared::save_image(image, Path::new(path), options.compression, 90)
                    .map_err(|e| format!("Failed to save {path}: {e}"))?;
            }
        }
        return Ok(result);
    }

    let plane = |image: &Image| {
        Plane::from_rgba8(Rgba8::new(
            &image.data,
            image.width as usize,
            image.height as usize,
        ))
        .map_err(|e| e.to_string())
    };
    let (plane1, plane2) = (plane(&image1)?, plane(&image2)?);
    let shared = SsimOptions::default();

    let outcome = match args.source.as_str() {
        "ssim" => ssim(&plane1, &plane2, &shared),
        "ms-ssim" => ms_ssim(&plane1, &plane2, &shared, &MsSsimOptions::default()),
        "hitchhikers-ssim" => {
            hitchhikers_ssim(&plane1, &plane2, &shared, &HitchhikersOptions::default())
        }
        other => {
            return Err(format!(
                "Unknown source '{other}'. Expected one of: pixel, ssim, ms-ssim, hitchhikers-ssim"
            ))
        }
    }
    .map_err(|e| e.to_string())?;

    interpret(
        &image1,
        &image2,
        ChangeSource::Ssim {
            outcome: &outcome,
            floor: args.region_floor as f32,
        },
    )
    .map_err(|e| e.to_string())
}

fn main() -> ExitCode {
    let args = Args::parse();

    let result = match run(&args) {
        Ok(result) => result,
        Err(message) => {
            eprintln!("{message}");
            return ExitCode::from(2);
        }
    };

    if args.json {
        match serde_json::to_string_pretty(&result) {
            Ok(json) => println!("{json}"),
            Err(e) => {
                eprintln!("Failed to serialize: {e}");
                return ExitCode::from(2);
            }
        }
    } else {
        println!("{}", result.summary);
        for region in &result.regions {
            println!(
                "  {:?} {:?} at {} ({}px, {:.2}%)",
                region.change_type,
                region.shape,
                region.position,
                region.pixel_count,
                region.percentage
            );
        }
    }

    if result.total_regions == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}
