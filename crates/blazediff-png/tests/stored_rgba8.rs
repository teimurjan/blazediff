//! The direct stored RGBA8 encode fast path (BlazeDiff's diff-write hot path):
//! `ColorMode::Rgba8` + `Filter::None` + level 0, non-interlaced. It writes the
//! PNG straight from borrowed rows with no intermediate raw/zlib buffer, so the
//! risk is the stored-block state machine that re-chunks the
//! `[filter byte] ++ row` logical stream to 0xffff bytes independent of row
//! boundaries. These cases cover blocks that split mid-row, at a row boundary,
//! and the trivial single-block image.

use blazediff_png::{decode, encode, encode_to, EncodeOptions, Filter, Image, ImageRef};

fn stored_opts() -> EncodeOptions {
    EncodeOptions {
        color: blazediff_png::ColorMode::Rgba8,
        compression: 0,
        filter: Filter::None,
        interlace: false,
    }
}

/// Deterministic RGBA pixels with non-trivial alpha so the bytes are not all
/// identical (a degenerate stream could mask block-framing bugs).
fn make_image(width: u32, height: u32) -> Image {
    let n = (width as usize) * (height as usize);
    let mut data = Vec::with_capacity(n * 4);
    for i in 0..n {
        let v = (i * 2654435761) as u32;
        data.extend_from_slice(&[v as u8, (v >> 8) as u8, (v >> 16) as u8, (v >> 24) as u8]);
    }
    Image {
        data,
        width,
        height,
    }
}

fn check(width: u32, height: u32) {
    let img = make_image(width, height);
    let opts = stored_opts();

    let buffered = encode(&img, &opts).expect("encode");

    let mut streamed = Vec::new();
    encode_to(ImageRef::from(&img), &opts, &mut streamed).expect("encode_to");

    // Buffer and streaming entry points must agree byte for byte.
    assert_eq!(
        buffered, streamed,
        "buffered vs streamed differ at {width}x{height}"
    );

    // Lossless round-trip through our own decoder.
    let back = decode(&buffered).expect("decode");
    assert_eq!(back.width, width);
    assert_eq!(back.height, height);
    assert_eq!(
        back.data, img.data,
        "round-trip mismatch at {width}x{height}"
    );
}

#[test]
fn single_block_small() {
    check(1, 1);
    check(2, 2);
    check(100, 100);
}

#[test]
fn block_splits_mid_row() {
    // stride = 1 + 16384*4 = 65537 > 0xffff, so the first 0xffff block ends in
    // the middle of the first row.
    check(16384, 2);
}

#[test]
fn block_splits_across_many_rows() {
    // raw_len = 30 * (1 + 655*4) = 78630, several blocks whose boundaries fall
    // at varied offsets within rows.
    check(655, 30);
    check(513, 41);
}

#[test]
fn tall_single_column() {
    // Stride = 5; many short rows per block exercises the filter-byte interleave.
    check(1, 5000);
}
