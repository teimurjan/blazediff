//! `encode_parallel`: the bytes must not depend on the thread count, every
//! mode must round-trip and cross-decode, and the banded zlib stream must
//! inflate (Adler-32 included) to exactly the raw stream `encode` compresses.

#![cfg(feature = "parallel")]

mod common;

use blazediff_png::{
    decode, encode, encode_parallel, ColorMode, EncodeOptions, Filter, Image, PngError,
};
use common::{image_for_mode, image_rs, spng, ALL_MODES};
use std::num::NonZeroUsize;

fn threads(n: usize) -> NonZeroUsize {
    NonZeroUsize::new(n).unwrap()
}

fn opts(color: ColorMode, compression: u8, interlace: bool) -> EncodeOptions {
    EncodeOptions {
        color,
        compression,
        filter: Filter::Adaptive,
        interlace,
    }
}

/// The concatenated IDAT payloads: the zlib stream.
fn idat_stream(png: &[u8]) -> Vec<u8> {
    let mut pos = 8;
    let mut stream = Vec::new();
    while pos + 8 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        if &png[pos + 4..pos + 8] == b"IDAT" {
            stream.extend_from_slice(&png[pos + 8..pos + 8 + len]);
        }
        pos += 12 + len;
    }
    stream
}

/// Inflate with libdeflate, which rejects a wrong Adler-32 trailer.
fn inflate(zlib: &[u8], image: &Image) -> Vec<u8> {
    let mut raw = vec![0u8; image.data.len() * 2 + image.height as usize * 8 + 64];
    let n = libdeflater::Decompressor::new()
        .zlib_decompress(zlib, &mut raw)
        .expect("valid zlib stream with a correct Adler-32");
    raw.truncate(n);
    raw
}

/// Raw stream sizes chosen against the 256 KiB band:
/// (mode, w, h, raw length, label). Rows are a filter byte plus the samples.
const BAND_CASES: [(ColorMode, u32, u32, usize, &str); 4] = [
    (ColorMode::Gray8, 64, 64, 65 * 64, "one short band"),
    (ColorMode::Gray8, 1023, 256, 256 * 1024, "exactly one band"),
    (
        ColorMode::Gray8,
        1023,
        512,
        2 * 256 * 1024,
        "exactly two bands",
    ),
    (ColorMode::Rgba8, 1024, 700, 4097 * 700, "short last band"),
];

#[test]
fn bytes_do_not_depend_on_thread_count() {
    for (mode, w, h, _, label) in BAND_CASES {
        let image = image_for_mode(mode, w, h, w ^ h);
        let o = opts(mode, 6, false);
        let single = encode_parallel(&image, &o, threads(1)).unwrap();
        for n in [2, 3, 8] {
            let png = encode_parallel(&image, &o, threads(n)).unwrap();
            assert!(png == single, "{label}: {n} threads changed the bytes");
        }
        assert_eq!(decode(&single).unwrap().data, image.data, "{label}");
    }
}

#[test]
fn banded_stream_inflates_to_the_encode_raw_stream() {
    for (mode, w, h, raw_len, label) in BAND_CASES {
        let image = image_for_mode(mode, w, h, w ^ h);
        let o = opts(mode, 6, false);
        let banded = inflate(
            &idat_stream(&encode_parallel(&image, &o, threads(4)).unwrap()),
            &image,
        );
        let reference = inflate(&idat_stream(&encode(&image, &o).unwrap()), &image);
        assert_eq!(banded.len(), raw_len, "{label}: raw length");
        assert!(banded == reference, "{label}: raw stream differs");
    }
}

#[test]
fn roundtrip_and_cross_decode_every_mode() {
    for mode in ALL_MODES {
        for interlace in [false, true] {
            for level in [1u8, 4, 9, 12] {
                // RGBA8 at 300x250 spans two bands; gray modes fit in one.
                let image = image_for_mode(mode, 300, 250, level.into());
                let label = format!("{mode:?} il={interlace} lvl={level}");
                let png = encode_parallel(&image, &opts(mode, level, interlace), threads(4))
                    .unwrap_or_else(|e| panic!("{label}: {e}"));
                let want = (image.width, image.height, image.data.clone());
                assert_eq!(
                    decode(&png).unwrap().data,
                    image.data,
                    "{label}: own decode"
                );
                assert_eq!(spng(&png), Some(want.clone()), "{label}: spng");
                assert_eq!(image_rs(&png), Some(want), "{label}: image-rs");
            }
        }
    }
}

#[test]
fn level_zero_is_plain_encode() {
    let image = image_for_mode(ColorMode::Rgba8, 200, 150, 9);
    for o in [
        EncodeOptions {
            color: ColorMode::Rgba8,
            compression: 0,
            filter: Filter::None,
            interlace: false,
        },
        opts(ColorMode::Auto, 0, false),
    ] {
        assert_eq!(
            encode_parallel(&image, &o, threads(4)).unwrap(),
            encode(&image, &o).unwrap()
        );
    }
}

#[test]
fn out_of_range_level_is_rejected() {
    let image = image_for_mode(ColorMode::Rgba8, 4, 4, 1);
    assert!(matches!(
        encode_parallel(&image, &opts(ColorMode::Auto, 13, false), threads(2)),
        Err(PngError::InvalidOptions(_))
    ));
}
