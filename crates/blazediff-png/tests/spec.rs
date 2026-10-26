//! Spec-derived decode tests with no decoder oracle: expected RGBA8 comes from
//! hand-worked values or from test-local implementations of the PNG spec's
//! filter, Adam7 and sample-scaling rules. They hold on every backend and do
//! not inherit spng's quirks.

mod common;

use blazediff_png::decode;
use common::{chunk, ihdr, lcg_bytes, pack_rows, png_with, zlib};

const GRAY: u8 = 0;
const RGB: u8 = 2;
const INDEXED: u8 = 3;
const GRAY_ALPHA: u8 = 4;
const RGBA: u8 = 6;

#[track_caller]
fn assert_decodes(png: &[u8], want: &[u8], label: &str) {
    let img = decode(png).unwrap_or_else(|e| panic!("{label}: rejected ({e})"));
    assert_eq!(img.data, want, "{label}");
}

fn gray_rgba(samples: &[u8]) -> Vec<u8> {
    samples.iter().flat_map(|&g| [g, g, g, 255]).collect()
}

// --- filters: hand-worked vectors ---

#[test]
fn sub_filter_first_row_uses_left_pixel_only() {
    // RGB8 1x2, Sub: the second pixel stores raw - first pixel, per channel.
    let stream = [1, 10, 20, 30, 251, 5, 10];
    let png = png_with(ihdr(2, 1, 8, RGB), &[], &zlib(&stream));
    assert_decodes(&png, &[10, 20, 30, 255, 5, 25, 40, 255], "sub");
}

#[test]
fn up_filter_wraps_mod_256() {
    // Gray8 2x2. Row 1, Up: 255 - 1 = 254 and 0 - 2 = -2 = 254.
    let stream = [0, 1, 2, 2, 254, 254];
    let png = png_with(ihdr(2, 2, 8, GRAY), &[], &zlib(&stream));
    assert_decodes(&png, &gray_rgba(&[1, 2, 255, 0]), "up");
}

#[test]
fn average_filter_sums_without_overflow() {
    // Gray8 2x2, row 1 Average. x0: floor((0 + 100) / 2) = 50, 200 - 50 = 150.
    // x1: floor((200 + 250) / 2) = 225 (not (450 mod 256) / 2), 230 - 225 = 5.
    let stream = [0, 100, 250, 3, 150, 5];
    let png = png_with(ihdr(2, 2, 8, GRAY), &[], &zlib(&stream));
    assert_decodes(&png, &gray_rgba(&[100, 250, 200, 230]), "average");
}

#[test]
fn paeth_filter_predictor_and_first_row() {
    // Gray8 3x2. Row 0 Sub: 10, 20 - 10, 30 - 20.
    // Row 1 Paeth, (a, b, c) = (left, up, up-left), p = a + b - c:
    //   x0 (0, 10, 0): p 10, pa 10, pb 0 -> b = 10, 40 - 10 = 30
    //   x1 (40, 20, 10): p 50, pa 10, pb 30, pc 40 -> a = 40, 60 - 40 = 20
    //   x2 (60, 30, 20): p 70, pa 10, pb 40, pc 50 -> a = 60, 50 - 60 = 246
    let stream = [1, 10, 10, 10, 4, 30, 20, 246];
    let png = png_with(ihdr(3, 2, 8, GRAY), &[], &zlib(&stream));
    assert_decodes(&png, &gray_rgba(&[10, 20, 30, 40, 60, 50]), "paeth");
}

#[test]
fn paeth_ties_prefer_a_then_b() {
    // Gray8 2x2 with row 0 = [c, b] and row 1 = [a, 100]. x0 of row 1 has
    // (0, c, 0): predictor b = c = 4, so 2 - 4 = 254 decodes to a = 2.
    // (a, b, c) = (2, 5, 4): p 3, pa 1, pb 2, pc 1. pa ties pc, a wins: 98.
    let tie_a = [0, 4, 5, 4, 254, 98];
    let png = png_with(ihdr(2, 2, 8, GRAY), &[], &zlib(&tie_a));
    assert_decodes(&png, &gray_rgba(&[4, 5, 2, 100]), "paeth tie a/c");
    // (a, b, c) = (2, 8, 4): p 6, pa 4, pb 2, pc 2. pb ties pc, b wins: 92.
    let tie_b = [0, 4, 8, 4, 254, 92];
    let png = png_with(ihdr(2, 2, 8, GRAY), &[], &zlib(&tie_b));
    assert_decodes(&png, &gray_rgba(&[4, 8, 2, 100]), "paeth tie b/c");
}

// --- filters: spec forward filter at every bytes-per-pixel ---

fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i16 + b as i16 - c as i16;
    let (pa, pb, pc) = (
        (p - a as i16).abs(),
        (p - b as i16).abs(),
        (p - c as i16).abs(),
    );
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

/// Spec section 7.3 forward filter for one scanline.
fn filter_row(filter: u8, row: &[u8], prior: &[u8], bpp: usize) -> Vec<u8> {
    let mut out = vec![filter];
    for x in 0..row.len() {
        let a = if x >= bpp { row[x - bpp] } else { 0 };
        let b = prior[x];
        let c = if x >= bpp { prior[x - bpp] } else { 0 };
        let predictor = match filter {
            0 => 0,
            1 => a,
            2 => b,
            3 => ((a as u16 + b as u16) / 2) as u8,
            _ => paeth(a, b, c),
        };
        out.push(row[x].wrapping_sub(predictor));
    }
    out
}

/// Raw big-endian samples to RGBA8: gray replicates, missing alpha is 255,
/// 16-bit samples keep the high byte.
fn raw_to_rgba(raw: &[u8], color: u8, depth: u8) -> Vec<u8> {
    let bytes = depth as usize / 8;
    let channels = match color {
        GRAY => 1,
        GRAY_ALPHA => 2,
        RGB => 3,
        _ => 4,
    };
    raw.chunks_exact(channels * bytes)
        .flat_map(|px| {
            let s: Vec<u8> = px.chunks_exact(bytes).map(|v| v[0]).collect();
            match color {
                GRAY => [s[0], s[0], s[0], 255],
                GRAY_ALPHA => [s[0], s[0], s[0], s[1]],
                RGB => [s[0], s[1], s[2], 255],
                _ => [s[0], s[1], s[2], s[3]],
            }
        })
        .collect()
}

#[test]
fn every_filter_type_at_every_bytes_per_pixel() {
    // (color, depth) -> bpp 1, 2, 3, 4, 6, 8.
    let layouts = [
        (GRAY, 8u8),
        (GRAY_ALPHA, 8),
        (RGB, 8),
        (RGBA, 8),
        (RGB, 16),
        (RGBA, 16),
    ];
    for (color, depth) in layouts {
        let channels = match color {
            GRAY => 1,
            GRAY_ALPHA => 2,
            RGB => 3,
            _ => 4,
        };
        let bpp = channels * depth as usize / 8;
        for w in [1u32, 2, 3, 5, 17] {
            let h = 6u32;
            let stride = w as usize * bpp;
            let raw = lcg_bytes(stride * h as usize, w * 31 + bpp as u32);
            for first in 0..5u8 {
                // Every filter type lands on row 0 for some `first`.
                let mut stream = Vec::new();
                let mut prior = vec![0u8; stride];
                for (y, row) in raw.chunks_exact(stride).enumerate() {
                    let filter = (first + y as u8) % 5;
                    stream.extend(filter_row(filter, row, &prior, bpp));
                    prior = row.to_vec();
                }
                let png = png_with(ihdr(w, h, depth, color), &[], &zlib(&stream));
                let label = format!("color {color} depth {depth} {w}x{h} first filter {first}");
                assert_decodes(&png, &raw_to_rgba(&raw, color, depth), &label);
            }
        }
    }
}

// --- Adam7 ---

/// Spec section 8.2: (x0, y0, dx, dy) per pass.
const ADAM7: [(u32, u32, u32, u32); 7] = [
    (0, 0, 8, 8),
    (4, 0, 8, 8),
    (0, 4, 4, 8),
    (2, 0, 4, 4),
    (0, 2, 2, 4),
    (1, 0, 2, 2),
    (0, 1, 1, 2),
];

fn pass_size(w: u32, h: u32, (x0, y0, dx, dy): (u32, u32, u32, u32)) -> (u32, u32) {
    (
        w.saturating_sub(x0).div_ceil(dx),
        h.saturating_sub(y0).div_ceil(dy),
    )
}

/// Adam7 stream (filter 0 rows) for 8-bit `channels`-sample pixels or 1-bit
/// gray, from a per-pixel sample function. Empty passes contribute nothing.
fn adam7_stream(
    w: u32,
    h: u32,
    depth: u8,
    channels: usize,
    sample: impl Fn(u32, u32) -> Vec<u8>,
) -> Vec<u8> {
    let mut stream = Vec::new();
    for pass in ADAM7 {
        let (pw, ph) = pass_size(w, h, pass);
        if pw == 0 || ph == 0 {
            continue;
        }
        let (x0, y0, dx, dy) = pass;
        for py in 0..ph {
            let samples: Vec<u8> = (0..pw)
                .flat_map(|px| sample(x0 + px * dx, y0 + py * dy))
                .collect();
            stream.push(0);
            if depth == 8 {
                stream.extend(samples);
            } else {
                stream.extend(pack_rows(&samples, pw as usize * channels, 1, depth));
            }
        }
    }
    stream
}

#[test]
fn adam7_pass_sizes_for_8x8() {
    let sizes: Vec<_> = ADAM7.iter().map(|&p| pass_size(8, 8, p)).collect();
    assert_eq!(
        sizes,
        [(1, 1), (1, 1), (2, 1), (2, 2), (4, 2), (4, 4), (8, 4)]
    );
}

#[test]
fn adam7_places_every_pixel_at_every_small_size() {
    for w in 1..=9u32 {
        for h in 1..=9u32 {
            let mut hdr = ihdr(w, h, 8, GRAY);
            hdr[12] = 1;
            let index = |x: u32, y: u32| (y * w + x) as u8;
            let stream = adam7_stream(w, h, 8, 1, |x, y| vec![index(x, y)]);
            let want: Vec<u8> = (0..h)
                .flat_map(|y| (0..w).flat_map(move |x| [index(x, y); 3].into_iter().chain([255])))
                .collect();
            let png = png_with(hdr, &[], &zlib(&stream));
            assert_decodes(&png, &want, &format!("gray8 adam7 {w}x{h}"));

            let mut hdr = ihdr(w, h, 8, RGB);
            hdr[12] = 1;
            let rgb = |x: u32, y: u32| vec![x as u8, y as u8, (x * 16 + y) as u8];
            let stream = adam7_stream(w, h, 8, 3, rgb);
            let want: Vec<u8> = (0..h)
                .flat_map(|y| (0..w).flat_map(move |x| [x as u8, y as u8, (x * 16 + y) as u8, 255]))
                .collect();
            let png = png_with(hdr, &[], &zlib(&stream));
            assert_decodes(&png, &want, &format!("rgb8 adam7 {w}x{h}"));

            // 1-bit rows pad each pass row to a whole byte.
            let mut hdr = ihdr(w, h, 1, GRAY);
            hdr[12] = 1;
            let bit = |x: u32, y: u32| ((x * 7 + y * 3) % 2) as u8;
            let stream = adam7_stream(w, h, 1, 1, |x, y| vec![bit(x, y)]);
            let want: Vec<u8> = (0..h)
                .flat_map(|y| (0..w).map(move |x| bit(x, y) * 255))
                .flat_map(|g| [g, g, g, 255])
                .collect();
            let png = png_with(hdr, &[], &zlib(&stream));
            assert_decodes(&png, &want, &format!("gray1 adam7 {w}x{h}"));
        }
    }
}

// --- sample scaling ---

#[test]
fn low_bit_gray_scales_by_bit_replication() {
    for (depth, scale) in [(1u8, 255u8), (2, 85), (4, 17)] {
        let levels: Vec<u8> = (0..1u16 << depth).map(|v| v as u8).collect();
        let w = levels.len() as u32;
        let mut stream = vec![0];
        stream.extend(pack_rows(&levels, w as usize, 1, depth));
        let png = png_with(ihdr(w, 1, depth, GRAY), &[], &zlib(&stream));
        let want: Vec<u8> = levels.iter().map(|v| v * scale).collect();
        assert_decodes(&png, &gray_rgba(&want), &format!("gray{depth}"));
    }
}

/// Not spec-mandated: 16 to 8 bit keeps the high byte, as spng and image-rs
/// `STRIP_16` do, rather than rounding.
#[test]
fn sixteen_bit_keeps_high_byte() {
    let stream = [0, 0x12, 0xFF, 0xFF, 0x00, 0x00, 0x80];
    let png = png_with(ihdr(3, 1, 16, GRAY), &[], &zlib(&stream));
    assert_decodes(&png, &gray_rgba(&[0x12, 0xFF, 0x00]), "gray16");
}

// --- palette and tRNS ---

#[test]
fn palette_with_short_trns() {
    // Entries past the tRNS length are opaque.
    let plte = chunk(b"PLTE", &[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let trns = chunk(b"tRNS", &[0, 128]);
    let png = png_with(ihdr(3, 1, 8, INDEXED), &[plte, trns], &zlib(&[0, 0, 1, 2]));
    assert_decodes(&png, &[1, 2, 3, 0, 4, 5, 6, 128, 7, 8, 9, 255], "indexed");
}

#[test]
fn trns_color_keys() {
    let key = |payload: &[u8]| vec![chunk(b"tRNS", payload)];

    let png = png_with(ihdr(2, 1, 8, GRAY), &key(&[0, 7]), &zlib(&[0, 7, 8]));
    assert_decodes(&png, &[7, 7, 7, 0, 8, 8, 8, 255], "gray8 key");

    // The key compares at 16 bits: 0x1235 is opaque though it truncates to 0x12.
    let png = png_with(
        ihdr(2, 1, 16, GRAY),
        &key(&[0x12, 0x34]),
        &zlib(&[0, 0x12, 0x34, 0x12, 0x35]),
    );
    assert_decodes(
        &png,
        &[0x12, 0x12, 0x12, 0, 0x12, 0x12, 0x12, 255],
        "gray16 key",
    );

    let png = png_with(
        ihdr(2, 1, 8, RGB),
        &key(&[0, 1, 0, 2, 0, 3]),
        &zlib(&[0, 1, 2, 3, 1, 2, 4]),
    );
    assert_decodes(&png, &[1, 2, 3, 0, 1, 2, 4, 255], "rgb8 key");

    let png = png_with(
        ihdr(2, 1, 16, RGB),
        &key(&[1, 2, 3, 4, 5, 6]),
        &zlib(&[0, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 7]),
    );
    assert_decodes(&png, &[1, 3, 5, 0, 1, 3, 5, 255], "rgb16 key");
}
