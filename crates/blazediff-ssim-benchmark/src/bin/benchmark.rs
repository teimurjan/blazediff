//! SSIM benchmark: blazediff's `ssim` / `ms-ssim` / `hitchhikers-ssim` against
//! [dssim](https://github.com/kornelski/dssim), over the repo's fixture pairs.
//!
//! dssim is a different algorithm, not a rescaling of the same one: it pools
//! weighted scales, downsamples in linear-light RGB to model viewing distance,
//! compares Lab a/b at reduced spatial precision, and pools by mean absolute
//! deviation. blazediff's metrics reduce to gamma-encoded luma and pool by mean
//! (or `1 - CoV`). So this measures what each library *costs* and where the two
//! *diverge* — time per pair, and whether they order the corpus the same way
//! (Spearman ρ over ranks). Their absolute scores are not comparable, and rank
//! agreement is not interchangeability: see the chroma and alpha cases in the
//! README for distortions one side scores at zero.
//!
//! Run: `cargo run --release -p blazediff-ssim-benchmark --features dssim`
//! Optional arg: a fixtures directory (defaults to the repo `fixtures/`).
//! Flags: `--max-mpx N` caps the corpus by image size (default 30);
//! `--ablate` times the tunable perceptual configurations instead of the
//! shipped metrics, matching the quality harness's `--ablate`.

use blazediff::{load_pngs, Image};
use blazediff_ssim_benchmark::bench::{collect_pairs, iters, timed, Pair};
use blazediff_ssim_benchmark::metrics::{self, Contender};
use blazediff_ssim_benchmark::stats::spearman;
use std::path::{Path, PathBuf};

/// Default size cap. dssim holds three `f32` LAB planes per image per scale and
/// blazediff's Hitchhiker's variant holds five `f64` summed-area tables, so a
/// 59 MPx fixture wants multiple gigabytes from both. The cap keeps the default
/// run inside a normal machine; `--max-mpx` lifts it.
const DEFAULT_MAX_MPX: f64 = 30.0;

struct Row {
    name: String,
    mpx: f64,
    /// `None` where the metric cannot run on an image this small.
    times: Vec<Option<f64>>,
    scores: Vec<Option<f64>>,
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut dir = None;
    let mut max_mpx = DEFAULT_MAX_MPX;
    let mut ablate = false;
    let mut only: Vec<String> = Vec::new();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--ablate" => ablate = true,
            "--only" => {
                only = args
                    .next()
                    .unwrap_or_else(|| panic!("--only needs a comma-separated metric list"))
                    .split(',')
                    .map(str::to_string)
                    .collect();
            }
            "--max-mpx" => {
                max_mpx = args
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or_else(|| panic!("--max-mpx needs a number"));
            }
            other => dir = Some(PathBuf::from(other)),
        }
    }
    let dir = dir.unwrap_or_else(|| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("fixtures")
    });

    let pairs = collect_pairs(&dir);
    assert!(
        !pairs.is_empty(),
        "no <stem>a/<stem>b PNG pairs under {}",
        dir.display()
    );

    println!(
        "Corpus: {} pairs under {} (cap {max_mpx} MPx)",
        pairs.len(),
        dir.display()
    );
    let mut contenders = if ablate {
        metrics::ablation()
    } else {
        metrics::baseline()
    };
    // `--only` keeps a subset by exact name, for iterating on one configuration
    // without paying for the whole table.
    if !only.is_empty() {
        contenders.retain(|c| only.iter().any(|name| *name == c.name));
        assert!(!contenders.is_empty(), "--only matched no metric");
    }
    println!(
        "Metrics: {} — dssim built {}\n",
        contenders
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        if metrics::DSSIM_THREADED {
            "WITH threads (rayon); blazediff is single-threaded, so this is not a like-for-like run"
        } else {
            "single-threaded, like blazediff"
        }
    );

    let mut rows = Vec::with_capacity(pairs.len());
    let mut skipped = Vec::new();
    for pair in &pairs {
        match measure(&contenders, pair, max_mpx) {
            Ok(row) => rows.push(row),
            Err(reason) => skipped.push(format!("{}: {reason}", pair.name)),
        }
    }

    print_time_table(&contenders, &rows);
    print_score_table(&contenders, &rows);
    print_rank_agreement(&contenders, &rows);

    if !skipped.is_empty() {
        println!("\nSkipped {} pair(s):", skipped.len());
        for line in &skipped {
            println!("  {line}");
        }
    }
}

fn measure(contenders: &[Contender], pair: &Pair, max_mpx: f64) -> Result<Row, String> {
    let (image1, image2) =
        load_pngs(&pair.a, &pair.b).map_err(|e| format!("decode failed: {e}"))?;
    if image1.width != image2.width || image1.height != image2.height {
        return Err("sides differ in size".to_string());
    }

    let mpx = (image1.width as f64 * image1.height as f64) / 1e6;
    if mpx > max_mpx {
        return Err(format!("{mpx:.1} MPx is over the --max-mpx cap"));
    }

    let mut times = vec![None; contenders.len()];
    let mut scores = vec![None; contenders.len()];
    for (index, contender) in contenders.iter().enumerate() {
        if !contender.supports(image1.width, image1.height) {
            continue;
        }
        scores[index] = Some(contender.score(&image1, &image2));
        times[index] = Some(time_metric(contender, &image1, &image2, mpx));
    }

    Ok(Row {
        name: pair.name.clone(),
        mpx,
        times,
        scores,
    })
}

fn time_metric(contender: &Contender, image1: &Image, image2: &Image, mpx: f64) -> f64 {
    timed(iters(mpx), 2000.0, || {
        std::hint::black_box(contender.score(image1, image2));
    })
}

fn print_time_table(contenders: &[Contender], rows: &[Row]) {
    println!("=== TIME (ms per pair, best-of, image IO excluded) ===");
    print!("{:<22}{:>7}", "pair", "MPx");
    for contender in contenders {
        print!("{:>13}", contender.name);
    }
    println!();
    let width = 22 + 7 + 13 * contenders.len();
    println!("{}", "-".repeat(width));

    // Only pairs every metric could run contribute to the totals, so the
    // MPx/s line compares like with like.
    let mut totals = vec![0f64; contenders.len()];
    let mut total_mpx = 0f64;
    let mut counted = 0;
    for row in rows {
        print!("{:<22}{:>7.1}", trunc(&row.name, 22), row.mpx);
        for time in &row.times {
            match time {
                Some(ms) => print!("{ms:>11.2}ms"),
                None => print!("{:>13}", "-"),
            }
        }
        println!();

        if row.times.iter().all(Option::is_some) {
            for (total, time) in totals.iter_mut().zip(&row.times) {
                *total += time.unwrap();
            }
            total_mpx += row.mpx;
            counted += 1;
        }
    }

    println!("{}", "-".repeat(width));
    print!("{:<22}{total_mpx:>7.1}", format!("TOTAL ({counted} pairs)"));
    for total in &totals {
        print!("{total:>11.2}ms");
    }
    println!();
    print!("{:<22}{:>7}", "MPx/s", "");
    for total in &totals {
        print!("{:>13.0}", total_mpx / total * 1e3);
    }
    println!();
    if let Some(dssim) = contenders.iter().position(Contender::is_dssim) {
        print!("{:<22}{:>7}", "vs dssim", "");
        for total in &totals {
            print!("{:>12.2}x", totals[dssim] / total);
        }
        println!();
    }
}

fn print_score_table(contenders: &[Contender], rows: &[Row]) {
    println!("\n=== SCORES ===");
    println!(
        "blazediff: similarity, 1.000000 = identical. dssim: dissimilarity, 0.000000 = identical."
    );
    print!("{:<22}", "pair");
    for contender in contenders {
        print!("{:>13}", contender.name);
    }
    println!();
    println!("{}", "-".repeat(22 + 13 * contenders.len()));
    for row in rows {
        print!("{:<22}", trunc(&row.name, 22));
        for score in &row.scores {
            match score {
                Some(value) => print!("{value:>13.6}"),
                None => print!("{:>13}", "-"),
            }
        }
        println!();
    }
}

fn print_rank_agreement(contenders: &[Contender], rows: &[Row]) {
    println!("\n=== RANK AGREEMENT WITH DSSIM (Spearman ρ) ===");
    println!("Do the metrics order the corpus by damage the same way? 1.0 = identical ordering.");
    println!("Ordering agreement only — a rank cannot see a distortion one side scores at zero.");

    // Restrict to pairs both metrics scored, so a skip cannot shift the ranks.
    // MS-SSIM's product pooling can also return NaN on anticorrelated content
    // (see `blazediff_ssim::ms_ssim`); those pairs have no rank to place.
    let Some(dssim) = contenders.iter().position(Contender::is_dssim) else {
        return;
    };
    for (index, contender) in contenders.iter().enumerate() {
        if index == dssim {
            continue;
        }
        let mut ours = Vec::new();
        let mut theirs = Vec::new();
        let mut unrankable = 0;
        for row in rows {
            let (Some(mine), Some(reference)) = (row.scores[index], row.scores[dssim]) else {
                continue;
            };
            if !mine.is_finite() || !reference.is_finite() {
                unrankable += 1;
                continue;
            }
            ours.push(contender.as_distance(mine));
            theirs.push(contenders[dssim].as_distance(reference));
        }
        let rho = spearman(&ours, &theirs);
        let note = if unrankable > 0 {
            format!(", {unrankable} non-finite excluded")
        } else {
            String::new()
        };
        println!(
            "{:<22}{rho:>8.4}   over {} pairs{note}",
            contender.name,
            ours.len()
        );
    }
}

fn trunc(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("…{}", &s[s.len() - (max - 1)..])
    }
}
