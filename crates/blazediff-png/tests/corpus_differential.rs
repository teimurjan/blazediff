//! Large real-world corpus differential harness against the spng reference
//! oracle. Opt-in via the `BLAZEDIFF_PNG_CORPUS` environment variable (a
//! `:`-separated list of directories, PATH-style); a no-op when unset so the
//! default `cargo test` needs no network. Populate a corpus with
//! `scripts/fetch-corpus.sh` — hundreds of real high-res photos (Urban100,
//! BSD100, Set14, Set5) plus the canonical PngSuite (every format corner and
//! the intentionally-malformed files).
//!
//! Three guarantees, per file:
//!   1. `decode` is byte-identical to spng's `SPNG_FMT_RGBA8` + tRNS output,
//!      with identical accept/reject on the malformed files.
//!   2. `decode_with` matches spng at every `SPNG_FMT_*` format, tRNS on/off.
//!   3. Every image both decoders accept survives a blazediff encode →
//!      blazediff/spng decode round-trip, byte-for-byte.
//!
//! Run (release strongly recommended — real photos):
//!   BLAZEDIFF_PNG_CORPUS=crates/blazediff-png/.corpus \
//!     cargo test -p blazediff-png --release --test corpus_differential -- --nocapture

use blazediff_png::{
    decode, decode_with, encode, ColorMode, DecodeFormat, DecodeOptions, EncodeOptions, Filter,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Directories to scan, from `BLAZEDIFF_PNG_CORPUS` (PATH-style). Empty when
/// the variable is unset — every test then returns without asserting.
fn corpus_dirs() -> Vec<PathBuf> {
    match std::env::var_os("BLAZEDIFF_PNG_CORPUS") {
        Some(v) => std::env::split_paths(&v)
            .filter(|p| !p.as_os_str().is_empty())
            .collect(),
        None => Vec::new(),
    }
}

/// Every `*.png` under the corpus roots, sorted for deterministic ordering.
fn collect_pngs(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack: Vec<PathBuf> = dirs.to_vec();
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path
                .extension()
                .and_then(|s| s.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("png"))
            {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

/// Prints a one-line skip notice and returns true when no corpus is set.
fn skip_if_no_corpus(test: &str) -> Vec<PathBuf> {
    let dirs = corpus_dirs();
    if dirs.is_empty() {
        eprintln!("{test}: BLAZEDIFF_PNG_CORPUS unset — skipping (run scripts/fetch-corpus.sh)");
        return Vec::new();
    }
    let files = collect_pngs(&dirs);
    assert!(
        !files.is_empty(),
        "{test}: BLAZEDIFF_PNG_CORPUS set but no .png files found under {dirs:?}"
    );
    files
}

fn snapshot(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    decode(bytes).ok().map(|i| (i.width, i.height, i.data))
}

fn oracle(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    blazediff_shared::decode_spng_reference(bytes)
        .ok()
        .map(|img| (img.width, img.height, img.data))
}

/// Classic zlib copies uninitialized window memory for a minority of corrupt
/// streams, so their decode (and even accept/reject) is nondeterministic and
/// carries no behavioral contract. Such an input is only a genuine divergence
/// if it survives heap perturbation — mirrors the fuzzer's classifier and the
/// synthetic `differential.rs` suite.
fn stable_under_heap_perturbation(
    bytes: &[u8],
    mine: &Option<(u32, u32, Vec<u8>)>,
    spng: &Option<(u32, u32, Vec<u8>)>,
) -> bool {
    for pattern in [0xAAu8, 0x55] {
        let scrub: Vec<Vec<u8>> = (0..8)
            .map(|i| vec![pattern; (1 << 15) + (i << 9)])
            .collect();
        std::hint::black_box(&scrub);
        drop(scrub);
        if &snapshot(bytes) != mine || &oracle(bytes) != spng {
            return false;
        }
    }
    true
}

#[track_caller]
fn assert_decode_parity(bytes: &[u8], label: &str) {
    let mine = snapshot(bytes);
    let spng = oracle(bytes);
    if mine == spng {
        return;
    }
    if !stable_under_heap_perturbation(bytes, &mine, &spng) {
        return;
    }
    match (&mine, &spng) {
        (Some((w, h, data)), Some((sw, sh, sdata))) => {
            assert_eq!((w, h), (sw, sh), "{label}: dimension mismatch");
            let i = data.iter().zip(sdata).position(|(a, b)| a != b).unwrap();
            panic!(
                "{label}: pixel mismatch at byte {i}: mine={:02x?} spng={:02x?}",
                &data[i..(i + 12).min(data.len())],
                &sdata[i..(i + 12).min(sdata.len())]
            );
        }
        (Some(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (None, Some(_)) => panic!(
            "{label}: blazediff_png rejects ({:?}), spng accepts",
            decode(bytes).err()
        ),
        (None, None) => unreachable!("equal verdicts returned early"),
    }
}

/// Guarantee 1: RGBA8 + tRNS decode parity across the whole corpus.
#[test]
fn corpus_decode_parity_with_spng() {
    let files = skip_if_no_corpus("corpus_decode_parity_with_spng");
    let accepted = AtomicUsize::new(0);
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let label = path.display().to_string();
        assert_decode_parity(&bytes, &label);
        if decode(&bytes).is_ok() {
            accepted.fetch_add(1, Ordering::Relaxed);
        }
    }
    if !files.is_empty() {
        eprintln!(
            "corpus_decode_parity_with_spng: {} files, {} decoded at parity",
            files.len(),
            accepted.load(Ordering::Relaxed)
        );
    }
}

const ALL_FORMATS: [DecodeFormat; 8] = [
    DecodeFormat::Rgba8,
    DecodeFormat::Rgba16,
    DecodeFormat::Rgb8,
    DecodeFormat::Ga8,
    DecodeFormat::Ga16,
    DecodeFormat::G8,
    DecodeFormat::Png,
    DecodeFormat::Raw,
];

fn spng_args(o: &DecodeOptions) -> (i32, i32) {
    let fmt = match o.format {
        DecodeFormat::Rgba8 => 1,
        DecodeFormat::Rgba16 => 2,
        DecodeFormat::Rgb8 => 4,
        DecodeFormat::Ga8 => 16,
        DecodeFormat::Ga16 => 32,
        DecodeFormat::G8 => 64,
        DecodeFormat::Png => 256,
        DecodeFormat::Raw => 512,
    };
    let mut flags = 0;
    if o.apply_trns {
        flags |= 1;
    }
    (fmt, flags)
}

#[track_caller]
fn assert_format_parity(bytes: &[u8], o: DecodeOptions, label: &str) {
    let mine = decode_with(bytes, &o)
        .ok()
        .map(|d| (d.width, d.height, d.data));
    let (fmt, flags) = spng_args(&o);
    let spng = blazediff_shared::decode_spng_reference_fmt(bytes, fmt, flags)
        .ok()
        .map(|(w, h, _, _, d)| (w, h, d));
    if mine == spng {
        return;
    }
    match (&mine, &spng) {
        (Some((w, h, d)), Some((sw, sh, sd))) => {
            assert_eq!((w, h), (sw, sh), "{label}: dimension mismatch");
            assert_eq!(
                d.len(),
                sd.len(),
                "{label}: length {} vs {}",
                d.len(),
                sd.len()
            );
            let i = d.iter().zip(sd).position(|(a, b)| a != b).unwrap();
            panic!(
                "{label}: first diff at byte {i}: mine={:02x?} spng={:02x?}",
                &d[i..(i + 12).min(d.len())],
                &sd[i..(i + 12).min(sd.len())]
            );
        }
        (Some(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (None, Some(_)) => panic!(
            "{label}: blazediff_png rejects ({:?}), spng accepts",
            decode_with(bytes, &o).err()
        ),
        (None, None) => unreachable!("equal verdicts returned early"),
    }
}

/// Guarantee 2: every output format matches spng, tRNS on and off, on real
/// image content of every color type / bit depth / interlace in the corpus.
#[test]
fn corpus_format_matrix_parity_with_spng() {
    let files = skip_if_no_corpus("corpus_format_matrix_parity_with_spng");
    let mut compared = 0usize;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        // The malformed files (both decoders reject) carry no format contract;
        // only exercise the matrix on inputs both decoders accept in RGBA8.
        if snapshot(&bytes) != oracle(&bytes) || snapshot(&bytes).is_none() {
            continue;
        }
        let stem = path.display().to_string();
        for &format in &ALL_FORMATS {
            for apply_trns in [false, true] {
                let o = DecodeOptions {
                    format,
                    apply_trns,
                    apply_gamma: false,
                    apply_sbit: false,
                };
                assert_format_parity(&bytes, o, &format!("{stem} [{format:?}/trns={apply_trns}]"));
                compared += 1;
            }
        }
    }
    if !files.is_empty() {
        eprintln!("corpus_format_matrix_parity_with_spng: {compared} format decodes at parity");
    }
}

fn encode_oracle(png: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    blazediff_shared::decode_spng_reference(png)
        .ok()
        .map(|i| (i.width, i.height, i.data))
}

/// Guarantee 3: encode → decode round-trip for every accepted image. `Auto`
/// mode must reproduce the source RGBA8 exactly (own decode and spng
/// cross-decode); a forced `Rgba8` mode exercises the 4-channel encode path
/// on real content. Level 12 / interlace are added only for small images to
/// bound wall-clock on the high-res photos.
#[test]
fn corpus_encode_roundtrip_and_cross_decode() {
    let files = skip_if_no_corpus("corpus_encode_roundtrip_and_cross_decode");
    const SMALL_PX: usize = 64 * 1024; // full option matrix under 256x256
    let mut encoded = 0usize;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let Some((w, h, want)) = snapshot(&bytes) else {
            continue; // rejected by us; skip
        };
        if oracle(&bytes).as_ref().map(|(_, _, d)| d) != Some(&want) {
            continue; // only round-trip images both decoders agree on
        }
        let small = (w as usize) * (h as usize) <= SMALL_PX;
        let mut opts = vec![
            EncodeOptions {
                color: ColorMode::Auto,
                compression: 0,
                filter: Filter::None,
                interlace: false,
            },
            EncodeOptions {
                color: ColorMode::Auto,
                compression: 6,
                filter: Filter::Adaptive,
                interlace: false,
            },
            EncodeOptions {
                color: ColorMode::Rgba8,
                compression: 6,
                filter: Filter::Adaptive,
                interlace: false,
            },
        ];
        if small {
            opts.push(EncodeOptions {
                color: ColorMode::Auto,
                compression: 12,
                filter: Filter::Adaptive,
                interlace: false,
            });
            opts.push(EncodeOptions {
                color: ColorMode::Auto,
                compression: 6,
                filter: Filter::Adaptive,
                interlace: true,
            });
        }
        let img = blazediff_png::Image {
            data: want.clone(),
            width: w,
            height: h,
        };
        for o in &opts {
            let label = format!(
                "{} [{:?}/lvl{}/{:?}/il={}]",
                path.display(),
                o.color,
                o.compression,
                o.filter,
                o.interlace
            );
            let png = encode(&img, o).unwrap_or_else(|e| panic!("{label}: encode failed: {e}"));
            let back = decode(&png).unwrap_or_else(|e| panic!("{label}: own decode failed: {e}"));
            assert_eq!((back.width, back.height), (w, h), "{label}: dims");
            assert_eq!(back.data, want, "{label}: own round-trip");
            let (sw, sh, sdata) =
                encode_oracle(&png).unwrap_or_else(|| panic!("{label}: spng rejected our output"));
            assert_eq!((sw, sh), (w, h), "{label}: spng dims");
            assert_eq!(sdata, want, "{label}: spng cross-decode");
            encoded += 1;
        }
    }
    if !files.is_empty() {
        eprintln!("corpus_encode_roundtrip_and_cross_decode: {encoded} encodes verified");
    }
}
