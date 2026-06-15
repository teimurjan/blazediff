//! Populates fuzz/corpus/{fuzz_decode,fuzz_decode_differential}/ with small
//! PNGs covering every color type and filter the fast path handles, plus
//! crops of the real page fixtures.
//!
//! Run: cargo run --manifest-path fuzz/Cargo.toml --features seed-gen --bin gen_seeds

use std::fs;
use std::path::{Path, PathBuf};

use png::{ColorType, Filter};

const TARGETS: [&str; 2] = ["fuzz_decode", "fuzz_decode_differential"];

fn corpus_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("corpus")
}

fn write_seed(name: &str, bytes: &[u8]) {
    for target in TARGETS {
        let dir = corpus_root().join(target);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(name), bytes).unwrap();
    }
}

fn lcg_bytes(n: usize, mut seed: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        v.push((seed >> 24) as u8);
    }
    v
}

fn encode(
    raw: &[u8],
    width: u32,
    height: u32,
    color: ColorType,
    filter: Filter,
    palette: Option<(&[u8], &[u8])>,
) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(color);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_filter(filter);
        if let Some((plte, trns)) = palette {
            enc.set_palette(plte.to_vec());
            enc.set_trns(trns.to_vec());
        }
        let mut w = enc.write_header().unwrap();
        w.write_image_data(raw).unwrap();
    }
    out
}

fn channels(color: ColorType) -> usize {
    match color {
        ColorType::Grayscale | ColorType::Indexed => 1,
        ColorType::GrayscaleAlpha => 2,
        ColorType::Rgb => 3,
        ColorType::Rgba => 4,
    }
}

fn color_name(color: ColorType) -> &'static str {
    match color {
        ColorType::Grayscale => "gray",
        ColorType::GrayscaleAlpha => "gray_alpha",
        ColorType::Rgb => "rgb",
        ColorType::Rgba => "rgba",
        ColorType::Indexed => "indexed",
    }
}

fn filter_name(filter: Filter) -> &'static str {
    match filter {
        Filter::NoFilter => "none",
        Filter::Sub => "sub",
        Filter::Up => "up",
        Filter::Avg => "avg",
        Filter::Paeth => "paeth",
        _ => "adaptive",
    }
}

fn synthetic_seeds() {
    let colors = [
        ColorType::Grayscale,
        ColorType::GrayscaleAlpha,
        ColorType::Rgb,
        ColorType::Rgba,
        ColorType::Indexed,
    ];
    let filters = [
        Filter::NoFilter,
        Filter::Sub,
        Filter::Up,
        Filter::Avg,
        Filter::Paeth,
        Filter::Adaptive,
    ];
    let full_palette: Vec<u8> = lcg_bytes(256 * 3, 7);

    for color in colors {
        for filter in filters {
            let raw = lcg_bytes(64 * 64 * channels(color), 42);
            let palette = (color == ColorType::Indexed).then_some((full_palette.as_slice(), &[][..]));
            let bytes = encode(&raw, 64, 64, color, filter, palette);
            write_seed(
                &format!("synthetic_{}_{}.png", color_name(color), filter_name(filter)),
                &bytes,
            );
        }
        // 1x1 edge case per color type.
        let raw = lcg_bytes(channels(color), 9);
        let palette = (color == ColorType::Indexed).then_some((full_palette.as_slice(), &[][..]));
        let bytes = encode(&raw, 1, 1, color, Filter::NoFilter, palette);
        write_seed(&format!("tiny_{}.png", color_name(color)), &bytes);
    }

    // Short palette + tRNS: exercises the alpha LUT and out-of-range indices.
    let plte = lcg_bytes(120 * 3, 11);
    let trns = lcg_bytes(40, 13);
    let raw = lcg_bytes(64 * 64, 17);
    let bytes = encode(&raw, 64, 64, ColorType::Indexed, Filter::Paeth, Some((&plte, &trns)));
    write_seed("synthetic_indexed_trns.png", &bytes);

    // zlib stored-block layout the png crate never emits, but fast_png_io's own
    // encoder produces — seeds the inflate path for level-0 screenshots.
    let img = blazediff::Image {
        data: lcg_bytes(64 * 64 * 4, 23),
        width: 64,
        height: 64,
    };
    write_seed("stored_blocks.png", &blazediff::fast_png_io::encode_stored(&img));
}

/// The page fixtures are 3000x13904 (41.7M px) — over the fuzz pixel budget,
/// so raw copies would be dead corpus entries. Crop the top-left window and
/// re-encode instead.
fn fixture_seeds() {
    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/page");
    for name in ["2a.png", "2b.png"] {
        let path = fixtures.join(name);
        if !path.exists() {
            eprintln!("skipping missing fixture {}", path.display());
            continue;
        }
        let bytes = crop_reencode(&path, 1024, 1024);
        write_seed(&format!("fixture_page_{}", name), &bytes);
    }
}

fn crop_reencode(path: &Path, crop_w: u32, crop_h: u32) -> Vec<u8> {
    let mut decoder = png::Decoder::new(std::io::BufReader::new(fs::File::open(path).unwrap()));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::ALPHA);
    let mut reader = decoder.read_info().unwrap();
    let mut buf = vec![0u8; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buf).unwrap();
    assert_eq!(info.color_type, ColorType::Rgba, "expected RGBA after EXPAND|ALPHA");

    let w = crop_w.min(info.width) as usize;
    let h = crop_h.min(info.height) as usize;
    let src_stride = info.width as usize * 4;
    let mut cropped = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        cropped.extend_from_slice(&buf[y * src_stride..y * src_stride + w * 4]);
    }
    encode(&cropped, w as u32, h as u32, ColorType::Rgba, Filter::Adaptive, None)
}

fn main() {
    synthetic_seeds();
    fixture_seeds();
    let count = fs::read_dir(corpus_root().join(TARGETS[0])).unwrap().count();
    println!("wrote {} seeds per target", count);
}
