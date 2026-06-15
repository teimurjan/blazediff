//! Microbench timer and fixture discovery, shared by the decode and encode
//! runs.

use std::path::{Path, PathBuf};
use std::time::Instant;

/// Best-of wall time (ms) for `f`, running until ~`budget_ms` elapses or
/// `max_iters` is reached, always at least twice. Best-of suppresses
/// scheduler noise far better than the mean for this kind of microbench.
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

/// Iteration counts scaled by image size: huge images get fewer reps so the
/// whole corpus stays under a minute.
pub fn iters(mpx: f64) -> u32 {
    if mpx > 8.0 {
        5
    } else {
        20
    }
}

/// Every `*.png` under `dir`, recursively, sorted for stable output.
pub fn collect_fixtures(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().is_some_and(|x| x == "png") {
                out.push(p);
            }
        }
    }
    out.sort();
    out
}
