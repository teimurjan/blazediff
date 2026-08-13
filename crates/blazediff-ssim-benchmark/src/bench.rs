//! Microbench timer and fixture-pair discovery for the speed benchmark.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Best-of wall time (ms) for `f`, running until ~`budget_ms` elapses or
/// `max_iters` is reached, always at least twice. Best-of suppresses scheduler
/// noise far better than the mean for this kind of microbench.
pub fn timed(max_iters: u32, budget_ms: f64, mut f: impl FnMut()) -> f64 {
    let mut best = f64::INFINITY;
    let start = Instant::now();
    let mut i = 0;
    loop {
        let t = Instant::now();
        f();
        best = best.min(t.elapsed().as_secs_f64() * 1e3);
        i += 1;
        if i >= max_iters || (i >= 2 && start.elapsed().as_secs_f64() * 1e3 > budget_ms) {
            break;
        }
    }
    best
}

/// Iteration counts scaled by image size. A 24 MPx dssim comparison is a
/// multi-second affair; repeating it twenty times buys nothing but wall clock.
pub fn iters(mpx: f64) -> u32 {
    if mpx > 16.0 {
        2
    } else if mpx > 4.0 {
        4
    } else {
        12
    }
}

/// A `<stem>a.png` / `<stem>b.png` fixture pair.
pub struct Pair {
    /// Path-relative label, e.g. `blazediff/1`.
    pub name: String,
    pub a: PathBuf,
    pub b: PathBuf,
}

/// Every `<stem>a.png` under `dir` that has a `<stem>b.png` beside it, sorted
/// for stable output. The whole corpus follows this naming convention, so it
/// doubles as the pairing rule.
pub fn collect_pairs(dir: &Path) -> Vec<Pair> {
    let mut by_name = BTreeMap::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().is_none_or(|ext| ext != "png") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let Some(side) = stem.chars().last().filter(|c| *c == 'a' || *c == 'b') else {
                continue;
            };
            let label = path
                .strip_prefix(dir)
                .unwrap_or(&path)
                .with_file_name(&stem[..stem.len() - 1])
                .to_string_lossy()
                .into_owned();
            let slot: &mut (Option<PathBuf>, Option<PathBuf>) = by_name.entry(label).or_default();
            if side == 'a' {
                slot.0 = Some(path);
            } else {
                slot.1 = Some(path);
            }
        }
    }

    by_name
        .into_iter()
        .filter_map(|(name, (a, b))| Some(Pair { name, a: a?, b: b? }))
        .collect()
}
