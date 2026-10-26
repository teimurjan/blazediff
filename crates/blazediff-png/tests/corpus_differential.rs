//! Large real-world corpus differential harness. Opt-in: the tests are
//! `#[ignore]`d and need `BLAZEDIFF_PNG_CORPUS` (a `:`-separated list of
//! directories, PATH-style), so the default `cargo test` needs no network.
//! Populate a corpus with `scripts/fetch-corpus.sh`: hundreds of real high-res
//! photos (Urban100, BSD100, Set14, Set5) plus the canonical PngSuite (every
//! format corner and the intentionally-malformed files).
//!
//! Three guarantees, per file:
//!   1. `decode` matches spng and image-rs on every file both oracles accept
//!      (Rule A), and spng's accept/reject on the rest (Rule B).
//!   2. `decode_with` matches spng at every `SPNG_FMT_*` format, tRNS on/off.
//!   3. Every image both decoders accept survives a blazediff encode, then
//!      blazediff/spng decode round-trip, byte-for-byte.
//!
//! Run (release strongly recommended for real photos):
//!   BLAZEDIFF_PNG_CORPUS=crates/blazediff-png/.corpus \
//!     cargo test -p blazediff-png --release --test corpus_differential -- --ignored --nocapture

mod common;

use blazediff_png::{
    decode, decode_with, encode, ColorMode, DecodeFormat, DecodeOptions, EncodeOptions, Filter,
};
use common::{assert_chunk_parity, assert_valid, image_rs, mine, spng};
use std::path::PathBuf;

const NEEDS_CORPUS: &str = "needs BLAZEDIFF_PNG_CORPUS (run scripts/fetch-corpus.sh)";

/// Every `*.png` under the `BLAZEDIFF_PNG_CORPUS` roots, sorted. Panics when
/// the variable is unset or the roots hold no PNGs, so a missing corpus can
/// never pass as green.
fn corpus_files() -> Vec<PathBuf> {
    let dirs: Vec<PathBuf> = std::env::var_os("BLAZEDIFF_PNG_CORPUS")
        .map(|v| {
            std::env::split_paths(&v)
                .filter(|p| !p.as_os_str().is_empty())
                .collect()
        })
        .unwrap_or_default();
    assert!(
        !dirs.is_empty(),
        "BLAZEDIFF_PNG_CORPUS unset: {NEEDS_CORPUS}"
    );
    let mut out = Vec::new();
    let mut stack = dirs.clone();
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
    assert!(!out.is_empty(), "no .png files found under {dirs:?}");
    out
}

/// Guarantee 1: three-way RGBA8 parity on every file both oracles accept,
/// spng accept/reject parity on the rest.
#[test]
#[ignore = "needs BLAZEDIFF_PNG_CORPUS"]
fn corpus_decode_parity() {
    let files = corpus_files();
    let mut three_way = 0usize;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let label = path.display().to_string();
        if spng(&bytes).is_some() && image_rs(&bytes).is_some() {
            assert_valid(&bytes, &label);
            three_way += 1;
        } else {
            assert_chunk_parity(&bytes, &label);
        }
    }
    eprintln!(
        "corpus_decode_parity: {} files, {three_way} at three-way parity",
        files.len()
    );
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
#[ignore = "needs BLAZEDIFF_PNG_CORPUS"]
fn corpus_format_matrix_parity_with_spng() {
    let files = corpus_files();
    let mut compared = 0usize;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        // The malformed files (both decoders reject) carry no format contract;
        // only exercise the matrix on inputs both decoders accept in RGBA8.
        if mine(&bytes) != spng(&bytes) || mine(&bytes).is_none() {
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
    eprintln!("corpus_format_matrix_parity_with_spng: {compared} format decodes at parity");
}

/// Guarantee 3: encode → decode round-trip for every accepted image. `Auto`
/// mode must reproduce the source RGBA8 exactly (own decode and spng
/// cross-decode); a forced `Rgba8` mode exercises the 4-channel encode path
/// on real content. Level 12 / interlace are added only for small images to
/// bound wall-clock on the high-res photos.
#[test]
#[ignore = "needs BLAZEDIFF_PNG_CORPUS"]
fn corpus_encode_roundtrip_and_cross_decode() {
    let files = corpus_files();
    const SMALL_PX: usize = 64 * 1024; // full option matrix under 256x256
    let mut encoded = 0usize;
    for path in &files {
        let bytes = std::fs::read(path).unwrap();
        let Some((w, h, want)) = mine(&bytes) else {
            continue; // rejected by us; skip
        };
        if spng(&bytes).as_ref().map(|(_, _, d)| d) != Some(&want) {
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
                spng(&png).unwrap_or_else(|| panic!("{label}: spng rejected our output"));
            assert_eq!((sw, sh), (w, h), "{label}: spng dims");
            assert_eq!(sdata, want, "{label}: spng cross-decode");
            encoded += 1;
        }
    }
    eprintln!("corpus_encode_roundtrip_and_cross_decode: {encoded} encodes verified");
}
