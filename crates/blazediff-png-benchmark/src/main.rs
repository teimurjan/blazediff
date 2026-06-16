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
use codecs::{EncMode, NAMES};
use std::path::{Path, PathBuf};

const N: usize = NAMES.len();

struct Row {
    name: String,
    mpx: f64,
    dec: [f64; N],
    // Two encode passes per codec: stored (no compression) and half of each
    // codec's own max deflate level. See [`EncMode`].
    enc_none: [f64; N],
    size_none: [usize; N],
    enc_half: [f64; N],
    size_half: [usize; N],
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let parity = args.iter().any(|a| a == "--parity");
    // `--json <path>` also dumps machine-readable per-fixture results, consumed
    // by `scripts/bench/png.js` to regenerate the website benchmark page.
    let mut json_path = None;
    let mut positional = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--json" => json_path = it.next().map(PathBuf::from),
            "--parity" => {}
            _ => positional.push(a.clone()),
        }
    }
    let dir = positional
        .into_iter()
        .next()
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
        let mut enc_none = [0f64; N];
        let mut size_none = [0usize; N];
        let mut enc_half = [0f64; N];
        let mut size_half = [0usize; N];
        for i in 0..N {
            dec[i] = timed(di, 800.0, || {
                std::hint::black_box(codecs::decode(i, &bytes));
            });
            size_none[i] = codecs::encode(i, &image, EncMode::None).len();
            enc_none[i] = timed(ei, 1500.0, || {
                std::hint::black_box(codecs::encode(i, &image, EncMode::None));
            });
            size_half[i] = codecs::encode(i, &image, EncMode::Half).len();
            enc_half[i] = timed(ei, 1500.0, || {
                std::hint::black_box(codecs::encode(i, &image, EncMode::Half));
            });
        }
        rows.push(Row {
            name,
            mpx,
            dec,
            enc_none,
            size_none,
            enc_half,
            size_half,
        });
    }

    print_time_table("DECODE", &rows, |r| &r.dec);
    print_time_table("ENCODE (no compression)", &rows, |r| &r.enc_none);
    print_time_table("ENCODE (half compression)", &rows, |r| &r.enc_half);
    print_size_table("ENCODE SIZE — no compression", &rows, |r| &r.size_none);
    print_size_table("ENCODE SIZE — half compression", &rows, |r| &r.size_half);

    if let Some(path) = json_path {
        write_json(&path, &rows);
        println!("\nJSON written to {}", path.display());
    }
}

/// Hand-rolled JSON (no serde dep), consumed by `scripts/bench/png.js`:
/// `{ names, encodeLevels: {none, half}, rows: [{name, mpx, dec, encNone,
/// sizeNone, encHalf, sizeHalf}] }`.
fn write_json(path: &Path, rows: &[Row]) {
    fn nums<T: std::fmt::Display>(xs: &[T]) -> String {
        xs.iter()
            .map(|x| x.to_string())
            .collect::<Vec<_>>()
            .join(",")
    }
    let strs = |labels: [&str; N]| {
        labels
            .iter()
            .map(|s| format!("{s:?}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    let ms = |xs: &[f64; N]| nums(&xs.iter().map(|v| format!("{v:.4}")).collect::<Vec<_>>());

    let names = strs(NAMES);
    let none_levels = strs(std::array::from_fn(|i| {
        codecs::level_label(i, EncMode::None)
    }));
    let half_levels = strs(std::array::from_fn(|i| {
        codecs::level_label(i, EncMode::Half)
    }));

    let mut out = String::new();
    out.push_str(&format!(
        "{{\n  \"names\": [{names}],\n  \"encodeLevels\": {{\"none\": [{none_levels}], \"half\": [{half_levels}]}},\n  \"rows\": [\n"
    ));
    for (i, r) in rows.iter().enumerate() {
        out.push_str(&format!(
            "    {{\"name\": {:?}, \"mpx\": {:.4}, \"dec\": [{}], \"encNone\": [{}], \"sizeNone\": [{}], \"encHalf\": [{}], \"sizeHalf\": [{}]}}{}\n",
            r.name,
            r.mpx,
            ms(&r.dec),
            ms(&r.enc_none),
            nums(&r.size_none),
            ms(&r.enc_half),
            nums(&r.size_half),
            if i + 1 < rows.len() { "," } else { "" }
        ));
    }
    out.push_str("  ]\n}\n");
    std::fs::write(path, out).expect("write json");
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
fn print_size_table(title: &str, rows: &[Row], pick: impl Fn(&Row) -> &[usize; N]) {
    println!("\n=== {title} (KB, lower is better) ===");
    print!("{:<24}", "fixture");
    for n in NAMES {
        print!("{:>12}", n);
    }
    println!();
    println!("{}", "-".repeat(24 + 12 * N));

    let mut totals = [0usize; N];
    for r in rows {
        print!("{:<24}", trunc(&r.name, 24));
        let v = pick(r);
        for i in 0..N {
            print!("{:>12.1}", v[i] as f64 / 1024.0);
            totals[i] += v[i];
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
