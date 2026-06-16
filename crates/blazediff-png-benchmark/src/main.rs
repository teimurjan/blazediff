//! PNG codec benchmark: blazediff_png vs spng vs image-rs `png` vs zune-png,
//! decode and encode, over the repo's `fixtures/` corpus.
//!
//! For every fixture it times each codec's decode and encode (best-of,
//! size-scaled iteration counts) and prints per-fixture and aggregate tables,
//! with encoded-output sizes so the speed/ratio trade-off is visible.
//!
//! Run: `cargo run --release -p blazediff-png-benchmark`
//! Optional arg: a fixtures directory (defaults to the repo `fixtures/`).
//!
//! Pass `--parity` to skip timing and instead assert that blazediff's PNG
//! output is byte-identical with `BLAZEDIFF_PNG_ENABLED` on vs off, per fixture
//! (exits non-zero on any mismatch). See [`parity`].

mod benchmark;
mod codecs;
mod parity;

use benchmark::{collect_fixtures, iters, timed};
use codecs::NAMES;
use std::path::{Path, PathBuf};

const N: usize = NAMES.len();

struct Row {
    name: String,
    mpx: f64,
    dec: [f64; N],
    enc: [f64; N],
    size: [usize; N],
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let parity = args.iter().any(|a| a == "--parity");
    let dir = args
        .iter()
        .find(|a| !a.starts_with("--"))
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures"));
    let fixtures = collect_fixtures(&dir);
    assert!(!fixtures.is_empty(), "no fixtures under {}", dir.display());

    if parity {
        if !parity::run(&fixtures, &dir) {
            std::process::exit(1);
        }
        return;
    }

    println!("Fixtures: {} PNGs under {}", fixtures.len(), dir.display());
    println!("Codecs: {}\n", NAMES.join(", "));

    let mut rows = Vec::with_capacity(fixtures.len());
    for path in &fixtures {
        let bytes = std::fs::read(path).unwrap();
        let name = path
            .strip_prefix(&dir)
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();

        // blazediff's decode is the authoritative RGBA8 source for the encode
        // pass and the canonical (width, height) for the MPx figure.
        let image = match blazediff_png::decode(&bytes) {
            Ok(img) => img,
            Err(e) => {
                println!("  SKIP {name}: blazediff decode failed: {e}");
                continue;
            }
        };
        let mpx = (image.width as f64 * image.height as f64) / 1e6;
        let di = iters(mpx);
        let ei = iters(mpx);

        let mut dec = [0f64; N];
        let mut enc = [0f64; N];
        let mut size = [0usize; N];
        for i in 0..N {
            dec[i] = timed(di, 800.0, || {
                std::hint::black_box(codecs::decode(i, &bytes));
            });
            size[i] = codecs::encode(i, &image).len();
            enc[i] = timed(ei, 1500.0, || {
                std::hint::black_box(codecs::encode(i, &image));
            });
        }
        rows.push(Row {
            name,
            mpx,
            dec,
            enc,
            size,
        });
    }

    print_time_table("DECODE", &rows, |r| &r.dec);
    print_time_table("ENCODE", &rows, |r| &r.enc);
    print_size_table(&rows);
}

/// A decode/encode timing table: per-fixture ms per codec, a TOTAL row, and a
/// throughput line (sum MPx / sum ms) per codec.
fn print_time_table(title: &str, rows: &[Row], pick: impl Fn(&Row) -> &[f64; N]) {
    println!("\n=== {title} (ms, best-of) ===");
    print!("{:<24}{:>7}", "fixture", "MPx");
    for n in NAMES {
        print!("{:>12}", n);
    }
    println!();
    println!("{}", "-".repeat(24 + 7 + 12 * N));

    let mut totals = [0f64; N];
    let mut tmpx = 0f64;
    for r in rows {
        print!("{:<24}{:>7.1}", trunc(&r.name, 24), r.mpx);
        let v = pick(r);
        for i in 0..N {
            print!("{:>10.2}ms", v[i]);
            totals[i] += v[i];
        }
        println!();
        tmpx += r.mpx;
    }

    println!("{}", "-".repeat(24 + 7 + 12 * N));
    print!("{:<24}{:>7.1}", "TOTAL", tmpx);
    for t in totals {
        print!("{:>10.2}ms", t);
    }
    println!();
    print!("{:<24}{:>7}", "MPx/s", "");
    for t in totals {
        print!("{:>12.0}", tmpx / t * 1e3);
    }
    println!();
}

/// Encoded-output sizes: KB per codec plus each codec's total as a percentage
/// of blazediff's (index 0), so the speed numbers are read with ratio in mind.
fn print_size_table(rows: &[Row]) {
    println!("\n=== ENCODE SIZE (KB, lower is better) ===");
    print!("{:<24}", "fixture");
    for n in NAMES {
        print!("{:>12}", n);
    }
    println!();
    println!("{}", "-".repeat(24 + 12 * N));

    let mut totals = [0usize; N];
    for r in rows {
        print!("{:<24}", trunc(&r.name, 24));
        for i in 0..N {
            print!("{:>12.1}", r.size[i] as f64 / 1024.0);
            totals[i] += r.size[i];
        }
        println!();
    }

    println!("{}", "-".repeat(24 + 12 * N));
    print!("{:<24}", "TOTAL");
    for t in totals {
        print!("{:>12.1}", t as f64 / 1024.0);
    }
    println!();
    print!("{:<24}", "vs blazediff");
    for t in totals {
        print!("{:>11.0}%", t as f64 / totals[0] as f64 * 100.0);
    }
    println!();
}

fn trunc(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("…{}", &s[s.len() - (max - 1)..])
    }
}
