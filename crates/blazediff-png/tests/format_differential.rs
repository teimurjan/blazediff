//! Differential tests for the decode output-format matrix (Phase 1) plus the
//! gamma / sBIT transforms (Phase 3), against the spng reference oracle at
//! every `SPNG_FMT_*` + decode-flags combination. Every authored input must
//! decode byte-identically — or be rejected identically — at every format.

mod common;

use blazediff_png::{decode_with, DecodeFormat, DecodeOptions};
use common::{chunk_with_crc, lcg_bytes, pack_rows, png_encode};

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
    if o.apply_gamma {
        flags |= 2;
    }
    if o.apply_sbit {
        flags |= 8;
    }
    (fmt, flags)
}

#[track_caller]
fn check(bytes: &[u8], o: DecodeOptions, label: &str) {
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
            let end = (i + 12).min(d.len());
            panic!(
                "{label}: first diff at byte {i}: mine={:02x?} spng={:02x?}",
                &d[i..end],
                &sd[i..end]
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

/// Run a single image through every format with tRNS off and on.
fn check_all_formats(bytes: &[u8], label: &str) {
    for &format in &ALL_FORMATS {
        for apply_trns in [false, true] {
            let o = DecodeOptions {
                format,
                apply_trns,
                apply_gamma: false,
                apply_sbit: false,
            };
            check(bytes, o, &format!("{label}/{format:?}/trns={apply_trns}"));
        }
    }
}

/// Insert an ancillary chunk (e.g. gAMA, sBIT) just after IHDR.
fn splice_chunk(png: &[u8], ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = png[..33].to_vec();
    out.extend_from_slice(&chunk_with_crc(ty, payload));
    out.extend_from_slice(&png[33..]);
    out
}

// --- tests ---

/// Every color type x bit depth (filter Paeth) decoded at every output
/// format, with and without tRNS.
#[test]
fn format_matrix_parity() {
    use png::{ColorType, Filter};
    let sizes: [(u32, u32); 4] = [(1, 1), (3, 2), (7, 7), (8, 8)];

    for &(w, h) in &sizes {
        let n = (w * h) as usize;
        let seed = w * 131 + h;

        // grayscale 1/2/4/8/16 (+ a present tRNS key)
        for depth in [1u8, 2, 4, 8, 16] {
            let samples = lcg_bytes(n, seed);
            let raw = match depth {
                16 => lcg_bytes(n * 2, seed ^ 1),
                8 => samples.clone(),
                d => pack_rows(&samples, w as usize, h as usize, d),
            };
            let bd = depth_of(depth);
            let key = (samples[0] & ((1u16 << depth.min(8)) as u8).wrapping_sub(1)) as u16;
            let base = png_encode(
                &raw,
                w,
                h,
                ColorType::Grayscale,
                bd,
                Filter::Paeth,
                None,
                None,
            );
            check_all_formats(&base, &format!("gray{depth}/{w}x{h}"));
            let with_trns = png_encode(
                &raw,
                w,
                h,
                ColorType::Grayscale,
                bd,
                Filter::Paeth,
                None,
                Some(&key.to_be_bytes()),
            );
            check_all_formats(&with_trns, &format!("gray{depth}+trns/{w}x{h}"));
        }

        // truecolor 8/16 (+ tRNS key matching the first pixel)
        for depth in [8u8, 16] {
            let raw = lcg_bytes(n * 3 * depth as usize / 8, seed ^ 2);
            let bd = depth_of(depth);
            check_all_formats(
                &png_encode(&raw, w, h, ColorType::Rgb, bd, Filter::Sub, None, None),
                &format!("rgb{depth}/{w}x{h}"),
            );
            let mut key = [0u8; 6];
            if depth == 16 {
                key.copy_from_slice(&raw[0..6]);
            } else {
                key[1] = raw[0];
                key[3] = raw[1];
                key[5] = raw[2];
            }
            check_all_formats(
                &png_encode(
                    &raw,
                    w,
                    h,
                    ColorType::Rgb,
                    bd,
                    Filter::Sub,
                    None,
                    Some(&key),
                ),
                &format!("rgb{depth}+trns/{w}x{h}"),
            );
        }

        // gray+alpha and RGBA, 8/16
        for depth in [8u8, 16] {
            let bd = depth_of(depth);
            for (color, ch, name) in [
                (ColorType::GrayscaleAlpha, 2usize, "ga"),
                (ColorType::Rgba, 4, "rgba"),
            ] {
                let raw = lcg_bytes(n * ch * depth as usize / 8, seed ^ 3);
                check_all_formats(
                    &png_encode(&raw, w, h, color, bd, Filter::Up, None, None),
                    &format!("{name}{depth}/{w}x{h}"),
                );
            }
        }

        // indexed 1/2/4/8, full palette, with and without tRNS
        for depth in [1u8, 2, 4, 8] {
            let n_colors = 1usize << depth;
            let plte = lcg_bytes(n_colors * 3, seed ^ 4);
            let trns = lcg_bytes((n_colors / 2).max(1), seed ^ 6);
            let bd = depth_of(depth);
            let mut indices = lcg_bytes(n, seed ^ 7);
            if n_colors < 256 {
                for i in &mut indices {
                    *i %= n_colors as u8;
                }
            }
            let raw = if depth == 8 {
                indices.clone()
            } else {
                pack_rows(&indices, w as usize, h as usize, depth)
            };
            check_all_formats(
                &png_encode(
                    &raw,
                    w,
                    h,
                    ColorType::Indexed,
                    bd,
                    Filter::NoFilter,
                    Some(&plte),
                    None,
                ),
                &format!("idx{depth}/{w}x{h}"),
            );
            check_all_formats(
                &png_encode(
                    &raw,
                    w,
                    h,
                    ColorType::Indexed,
                    bd,
                    Filter::NoFilter,
                    Some(&plte),
                    Some(&trns),
                ),
                &format!("idx{depth}+trns/{w}x{h}"),
            );
        }
    }
}

fn depth_of(depth: u8) -> png::BitDepth {
    match depth {
        1 => png::BitDepth::One,
        2 => png::BitDepth::Two,
        4 => png::BitDepth::Four,
        8 => png::BitDepth::Eight,
        _ => png::BitDepth::Sixteen,
    }
}

/// The full PngSuite corpus (incl. interlaced `basi*`, all real color/depth
/// combos) decoded at every output format — parity or matched rejection.
#[test]
fn format_pngsuite_parity() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/pngsuite");
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .expect("vendored pngsuite present")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "png"))
        .collect();
    entries.sort();
    assert!(entries.len() >= 170, "expected the full PngSuite corpus");

    for path in entries {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let bytes = std::fs::read(&path).unwrap();
        check_all_formats(&bytes, &name);
    }
}

/// gAMA gamma correction: spliced gAMA chunk, formats that honor it
/// (RGBA8/RGB8/RGBA16) across grayscale, truecolor, and indexed sources.
#[test]
fn gamma_parity() {
    use png::{BitDepth, ColorType, Filter};
    let gamma_fmts = [
        DecodeFormat::Rgba8,
        DecodeFormat::Rgb8,
        DecodeFormat::Rgba16,
    ];

    for &gama in &[20000u32, 45455, 100000, 220000] {
        let payload = gama.to_be_bytes();

        // grayscale 8 + 16, truecolor 8 + 16, indexed 8
        let cases: Vec<(Vec<u8>, &str)> = vec![
            (
                splice_chunk(
                    &png_encode(
                        &lcg_bytes(64, 1),
                        8,
                        8,
                        ColorType::Grayscale,
                        BitDepth::Eight,
                        Filter::Sub,
                        None,
                        None,
                    ),
                    b"gAMA",
                    &payload,
                ),
                "gray8",
            ),
            (
                splice_chunk(
                    &png_encode(
                        &lcg_bytes(128, 2),
                        8,
                        8,
                        ColorType::Grayscale,
                        BitDepth::Sixteen,
                        Filter::Sub,
                        None,
                        None,
                    ),
                    b"gAMA",
                    &payload,
                ),
                "gray16",
            ),
            (
                splice_chunk(
                    &png_encode(
                        &lcg_bytes(192, 3),
                        8,
                        8,
                        ColorType::Rgb,
                        BitDepth::Eight,
                        Filter::Sub,
                        None,
                        None,
                    ),
                    b"gAMA",
                    &payload,
                ),
                "rgb8",
            ),
            (
                splice_chunk(
                    &png_encode(
                        &lcg_bytes(384, 4),
                        8,
                        8,
                        ColorType::Rgb,
                        BitDepth::Sixteen,
                        Filter::Sub,
                        None,
                        None,
                    ),
                    b"gAMA",
                    &payload,
                ),
                "rgb16",
            ),
            (
                splice_chunk(
                    &png_encode(
                        &lcg_bytes(64, 5).iter().map(|b| b & 7).collect::<Vec<_>>(),
                        8,
                        8,
                        ColorType::Indexed,
                        BitDepth::Eight,
                        Filter::NoFilter,
                        Some(&lcg_bytes(24, 6)),
                        None,
                    ),
                    b"gAMA",
                    &payload,
                ),
                "idx8",
            ),
        ];

        for (bytes, name) in &cases {
            for &format in &gamma_fmts {
                let o = DecodeOptions {
                    format,
                    apply_trns: true,
                    apply_gamma: true,
                    apply_sbit: false,
                };
                check(bytes, o, &format!("gamma{gama}/{name}/{format:?}"));
            }
        }
    }
}

/// sBIT significant-bits rescale: spliced sBIT chunk across grayscale,
/// truecolor, gray+alpha, RGBA, and indexed sources at every format.
#[test]
fn sbit_parity() {
    use png::{BitDepth, ColorType, Filter};

    // (color, depth, sbit payload, label)
    let cases: Vec<(Vec<u8>, &'static [u8], &'static str)> = vec![
        (
            png_encode(
                &lcg_bytes(64, 11),
                8,
                8,
                ColorType::Grayscale,
                BitDepth::Eight,
                Filter::Sub,
                None,
                None,
            ),
            &[4],
            "gray8",
        ),
        (
            png_encode(
                &lcg_bytes(128, 12),
                8,
                8,
                ColorType::Grayscale,
                BitDepth::Sixteen,
                Filter::Sub,
                None,
                None,
            ),
            &[12],
            "gray16",
        ),
        (
            png_encode(
                &lcg_bytes(192, 13),
                8,
                8,
                ColorType::Rgb,
                BitDepth::Eight,
                Filter::Sub,
                None,
                None,
            ),
            &[5, 6, 5],
            "rgb8",
        ),
        (
            png_encode(
                &lcg_bytes(384, 14),
                8,
                8,
                ColorType::Rgb,
                BitDepth::Sixteen,
                Filter::Sub,
                None,
                None,
            ),
            &[11, 12, 10],
            "rgb16",
        ),
        (
            png_encode(
                &lcg_bytes(128, 15),
                8,
                8,
                ColorType::GrayscaleAlpha,
                BitDepth::Eight,
                Filter::Up,
                None,
                None,
            ),
            &[4, 6],
            "ga8",
        ),
        (
            png_encode(
                &lcg_bytes(256, 16),
                8,
                8,
                ColorType::Rgba,
                BitDepth::Eight,
                Filter::Up,
                None,
                None,
            ),
            &[5, 6, 5, 7],
            "rgba8",
        ),
        (
            png_encode(
                &lcg_bytes(64, 17).iter().map(|b| b & 7).collect::<Vec<_>>(),
                8,
                8,
                ColorType::Indexed,
                BitDepth::Eight,
                Filter::NoFilter,
                Some(&lcg_bytes(24, 18)),
                None,
            ),
            &[6, 5, 4],
            "idx8",
        ),
    ];

    for (base, sbit, name) in &cases {
        let bytes = splice_chunk(base, b"sBIT", sbit);
        for &format in &ALL_FORMATS {
            let o = DecodeOptions {
                format,
                apply_trns: true,
                apply_gamma: false,
                apply_sbit: true,
            };
            check(&bytes, o, &format!("sbit/{name}/{format:?}"));
        }
    }
}
