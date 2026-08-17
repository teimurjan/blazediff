//! Quality harness: how well does each metric predict human opinion?
//!
//! Scores every contender against a subjective-quality dataset and reports the
//! four figures the image-quality literature uses:
//!
//! - **SRCC / KRCC** — rank correlation with the mean opinion score. Fit-free,
//!   so these are the primary numbers.
//! - **PLCC / RMSE** — after the standard five-parameter logistic mapping, which
//!   fits out the monotonic nonlinearity between a metric and the 1-5 scale.
//!
//! Every metric is oriented to "predicted quality", higher = better, so all
//! correlations should come out positive. A negative one means something is
//! wired backwards.
//!
//! `--ablate` swaps the shipped metrics for the tunable perceptual variant at a
//! range of settings, to attribute the gap to individual departures. Because
//! that is a configuration search, its table also reports each fold separately:
//! folds are split by *reference image*, so a setting that only wins on the
//! fold it was picked on is visibly overfitting.
//!
//! Run:
//!   ./scripts/fetch-kadid10k.sh
//!   BLAZEDIFF_MOS_DATASET=.datasets/kadid10k \
//!     cargo run --release -p blazediff-ssim-benchmark --features dssim \
//!       --bin blazediff-ssim-quality -- [--ablate]

use blazediff::load_pngs;
use blazediff_ssim_benchmark::dataset::{load_kadid10k, Dataset};
use blazediff_ssim_benchmark::metrics::{self, Contender};
use blazediff_ssim_benchmark::stats::{kendall_tau_b, logistic_fit, spearman};
use rayon::prelude::*;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

/// One evaluated sample: predicted quality per contender, `None` where the
/// metric could not produce a usable number.
struct Prediction {
    quality: Vec<Option<f64>>,
    mos: f64,
    distortion: u32,
    fold: u32,
    /// Share of this distortion's pixel change that lives in chroma rather
    /// than luma, in 0..=1.
    chroma_share: f64,
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut root = None;
    let mut limit = usize::MAX;
    let mut ablate = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--ablate" => ablate = true,
            "--limit" => {
                limit = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| panic!("--limit needs a number"));
            }
            other => root = Some(PathBuf::from(other)),
        }
    }
    let root = root
        .or_else(|| std::env::var_os("BLAZEDIFF_MOS_DATASET").map(PathBuf::from))
        .unwrap_or_else(|| {
            eprintln!(
                "No dataset. Pass a path or set BLAZEDIFF_MOS_DATASET.\n\
                 Fetch one with ./scripts/fetch-kadid10k.sh"
            );
            std::process::exit(2);
        });

    let dataset = match load_kadid10k(&root) {
        Ok(dataset) => dataset,
        Err(e) => {
            eprintln!("Failed to load dataset at {}: {e}", root.display());
            std::process::exit(2);
        }
    };

    let contenders = if ablate {
        metrics::ablation()
    } else {
        metrics::baseline()
    };
    let total = dataset.samples.len().min(limit);
    println!(
        "Dataset: {} — {} of {} samples, {} distortion types",
        dataset.name,
        total,
        dataset.samples.len(),
        dataset.distortions().len()
    );
    println!(
        "Contenders: {}\n",
        contenders
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let done = AtomicUsize::new(0);
    let mut predictions: Vec<Prediction> = dataset.samples[..total]
        .par_iter()
        .map(|sample| {
            let (quality, chroma_share) =
                evaluate(&contenders, &sample.reference, &sample.distorted);
            let seen = done.fetch_add(1, Ordering::Relaxed) + 1;
            if seen % 2000 == 0 {
                eprintln!("  scored {seen}/{total}");
            }
            Prediction {
                quality,
                mos: sample.mos,
                distortion: sample.distortion,
                fold: sample.fold,
                chroma_share,
            }
        })
        .collect();
    predictions.retain(|p| p.quality.iter().any(Option::is_some));

    print_overall(&contenders, &predictions);
    if ablate {
        print_folds(&contenders, &predictions);
    } else {
        print_per_distortion(&dataset, &contenders, &predictions);
    }
    print_verdict(&contenders, &predictions);
}

/// Score one pair with every contender, oriented so higher = better quality,
/// plus the share of the change that is chroma-only.
fn evaluate(
    contenders: &[Contender],
    reference: &std::path::Path,
    distorted: &std::path::Path,
) -> (Vec<Option<f64>>, f64) {
    let Ok((image1, image2)) = load_pngs(reference, distorted) else {
        return (vec![None; contenders.len()], 0.0);
    };
    if image1.width != image2.width || image1.height != image2.height {
        return (vec![None; contenders.len()], 0.0);
    }

    let quality = contenders
        .iter()
        .map(|contender| {
            if !contender.supports(image1.width, image1.height) {
                return None;
            }
            let score = contender.score(&image1, &image2);
            // MS-SSIM's product pooling can return NaN on anticorrelated content.
            score.is_finite().then(|| contender.as_quality(score))
        })
        .collect();
    (quality, chroma_share(&image1, &image2))
}

/// How much of the change between two images is carried by chroma rather than
/// luma, as `|Δchroma| / (|Δluma| + |Δchroma|)`.
///
/// This is the diagnostic that turns "we are blind to chroma" from a claim into
/// a measurement: if the distortion types where dssim beats us are the ones
/// with a high chroma share, adding colour channels is the fix, and if they are
/// not, it is not.
fn chroma_share(image1: &blazediff::Image, image2: &blazediff::Image) -> f64 {
    // BT.601, the basis for the Cb/Cr axes chroma subsampling is defined on.
    fn ycbcr(pixel: &[u8]) -> (f32, f32, f32) {
        let (r, g, b) = (pixel[0] as f32, pixel[1] as f32, pixel[2] as f32);
        let y = 0.299 * r + 0.587 * g + 0.114 * b;
        (y, 0.564 * (b - y), 0.713 * (r - y))
    }

    let mut luma = 0f64;
    let mut chroma = 0f64;
    for (a, b) in image1.data.chunks_exact(4).zip(image2.data.chunks_exact(4)) {
        let (y1, cb1, cr1) = ycbcr(a);
        let (y2, cb2, cr2) = ycbcr(b);
        luma += (y1 - y2).abs() as f64;
        chroma += (((cb1 - cb2).abs() + (cr1 - cr2).abs()) * 0.5) as f64;
    }
    let total = luma + chroma;
    if total > 0.0 {
        chroma / total
    } else {
        0.0
    }
}

/// `(predicted quality, MOS)` for every sample this contender could score.
fn paired(predictions: &[Prediction], index: usize, fold: Option<u32>) -> (Vec<f64>, Vec<f64>) {
    let mut quality = Vec::new();
    let mut mos = Vec::new();
    for prediction in predictions {
        if fold.is_some_and(|f| prediction.fold != f) {
            continue;
        }
        if let Some(value) = prediction.quality[index] {
            if value.is_finite() {
                quality.push(value);
                mos.push(prediction.mos);
            }
        }
    }
    (quality, mos)
}

fn print_overall(contenders: &[Contender], predictions: &[Prediction]) {
    println!("=== AGREEMENT WITH HUMAN OPINION ===");
    println!("SRCC/KRCC are fit-free rank correlations. PLCC/RMSE follow the standard");
    println!("five-parameter logistic mapping. Higher is better except RMSE.\n");
    println!(
        "{:<26}{:>9}{:>9}{:>9}{:>9}{:>8}",
        "metric", "SRCC", "KRCC", "PLCC", "RMSE", "n"
    );
    println!("{}", "-".repeat(26 + 9 * 4 + 8));

    for (index, contender) in contenders.iter().enumerate() {
        let (quality, mos) = paired(predictions, index, None);
        if quality.len() < 3 {
            println!("{:<26}{:>9}", contender.name, "no data");
            continue;
        }
        let srcc = spearman(&quality, &mos);
        let krcc = kendall_tau_b(&quality, &mos);
        let (plcc, rmse) = logistic_fit(&quality, &mos);
        println!(
            "{:<26}{srcc:>9.4}{krcc:>9.4}{plcc:>9.4}{rmse:>9.4}{:>8}",
            contender.name,
            quality.len()
        );
    }
}

/// Per-fold SRCC. A configuration search that only wins on one fold is fitting
/// the fold, not the problem.
fn print_folds(contenders: &[Contender], predictions: &[Prediction]) {
    println!("\n=== SRCC BY HELD-OUT FOLD (split by reference image) ===");
    println!("A setting worth keeping wins on both halves, not just one.\n");
    println!(
        "{:<26}{:>10}{:>10}{:>10}",
        "metric", "fold A", "fold B", "spread"
    );
    println!("{}", "-".repeat(26 + 30));

    for (index, contender) in contenders.iter().enumerate() {
        let fold_srcc = |fold: u32| {
            let (quality, mos) = paired(predictions, index, Some(fold));
            if quality.len() < 3 {
                f64::NAN
            } else {
                spearman(&quality, &mos)
            }
        };
        let (a, b) = (fold_srcc(0), fold_srcc(1));
        println!(
            "{:<26}{a:>10.4}{b:>10.4}{:>10.4}",
            contender.name,
            (a - b).abs()
        );
    }
}

fn print_per_distortion(dataset: &Dataset, contenders: &[Contender], predictions: &[Prediction]) {
    println!("\n=== SRCC PER DISTORTION TYPE ===");
    println!("`chroma` is the share of the distortion carried by Cb/Cr rather than luma,");
    println!("and `gap` is dssim's SRCC minus the best blazediff metric's.\n");
    print!("{:<12}", "distortion");
    for contender in contenders {
        print!("{:>13}", contender.name);
    }
    print!("{:>9}{:>8}", "chroma", "gap");
    println!();
    let width = 12 + 13 * contenders.len() + 17;
    println!("{}", "-".repeat(width));

    let dssim = contenders.iter().position(Contender::is_dssim);
    let mut wins = vec![0usize; contenders.len()];
    let mut chroma_by_type = Vec::new();
    let mut gap_by_type = Vec::new();

    for distortion in dataset.distortions() {
        let subset: Vec<&Prediction> = predictions
            .iter()
            .filter(|p| p.distortion == distortion)
            .collect();
        if subset.len() < 3 {
            continue;
        }

        print!("{:<12}", dataset.label(distortion));
        let mut row = vec![f64::NAN; contenders.len()];
        for (index, slot) in row.iter_mut().enumerate() {
            let mut quality = Vec::new();
            let mut mos = Vec::new();
            for prediction in &subset {
                if let Some(value) = prediction.quality[index] {
                    quality.push(value);
                    mos.push(prediction.mos);
                }
            }
            *slot = if quality.len() >= 3 {
                spearman(&quality, &mos)
            } else {
                f64::NAN
            };
            match *slot {
                value if value.is_finite() => print!("{value:>13.4}"),
                _ => print!("{:>13}", "-"),
            }
        }

        let chroma = subset.iter().map(|p| p.chroma_share).sum::<f64>() / subset.len() as f64;
        if let Some(dssim) = dssim {
            let best_ours = row
                .iter()
                .enumerate()
                .filter(|(i, v)| *i != dssim && v.is_finite())
                .map(|(_, v)| *v)
                .fold(f64::NEG_INFINITY, f64::max);
            let gap = row[dssim] - best_ours;
            print!("{chroma:>9.3}{gap:>8.3}");
            chroma_by_type.push(chroma);
            gap_by_type.push(gap);
        }
        println!();

        if let Some(best) = (0..row.len())
            .filter(|i| row[*i].is_finite())
            .max_by(|a, b| row[*a].partial_cmp(&row[*b]).unwrap())
        {
            wins[best] += 1;
        }
    }

    println!("{}", "-".repeat(width));
    print!("{:<12}", "types won");
    for count in &wins {
        print!("{count:>13}");
    }
    println!();

    if chroma_by_type.len() >= 3 {
        let rho = spearman(&chroma_by_type, &gap_by_type);
        println!(
            "\nChroma share vs dssim's lead, across the {} distortion types: Spearman ρ = {rho:.4}",
            chroma_by_type.len()
        );
        println!("A high positive ρ means dssim's advantage concentrates exactly where the");
        println!("distortion is carried by colour — i.e. that chroma channels would close it.");
    }
}

fn print_verdict(contenders: &[Contender], predictions: &[Prediction]) {
    let mut ranked: Vec<(usize, f64)> = (0..contenders.len())
        .filter_map(|index| {
            let (quality, mos) = paired(predictions, index, None);
            (quality.len() >= 3).then(|| (index, spearman(&quality, &mos)))
        })
        .filter(|(_, srcc)| srcc.is_finite())
        .collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    println!("\n=== VERDICT (overall SRCC) ===");
    for (position, (index, srcc)) in ranked.iter().enumerate() {
        println!("{}. {:<26}{srcc:.4}", position + 1, contenders[*index].name);
    }

    let dssim = ranked
        .iter()
        .find(|(index, _)| contenders[*index].is_dssim())
        .map(|(_, srcc)| *srcc);
    if let (Some(dssim), Some((best, best_srcc))) = (dssim, ranked.first().copied()) {
        if contenders[best].is_dssim() {
            match ranked
                .iter()
                .find(|(index, _)| !contenders[*index].is_dssim())
            {
                Some((index, srcc)) => println!(
                    "\ndssim still leads. Closest is {} at {srcc:.4}, behind by {:.4}.",
                    contenders[*index].name,
                    dssim - srcc
                ),
                None => println!("\ndssim still leads."),
            }
        } else {
            println!(
                "\n{} leads dssim by {:.4} SRCC.",
                contenders[best].name,
                best_srcc - dssim
            );
        }
    }
}
