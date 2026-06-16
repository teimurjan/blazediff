//! Encode verification: `decode(encode(img)) == img` for every option
//! combination, and spng must cross-decode our output to the identical
//! RGBA8 (which also gives interlaced *decode* coverage, since the png
//! crate cannot author Adam7 files).

use blazediff_png::{decode, encode, ColorMode, EncodeOptions, Filter, FilterSet, Image};

fn oracle(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let img = blazediff::decode_spng_reference(bytes).expect("spng must accept our output");
    (img.width, img.height, img.data)
}

fn lcg_bytes(n: usize, mut seed: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        v.push((seed >> 24) as u8);
    }
    v
}

/// An image representable in the given mode (so the round-trip is lossless).
fn image_for_mode(mode: ColorMode, w: u32, h: u32, seed: u32) -> Image {
    let n = (w * h) as usize;
    let noise = lcg_bytes(n * 4, seed);
    let mut data = vec![0u8; n * 4];
    for (i, px) in data.chunks_exact_mut(4).enumerate() {
        let r = noise[i * 4];
        let (p, a) = match mode {
            ColorMode::Gray1 => ([if r & 1 == 0 { 0 } else { 255 }; 3], 255),
            ColorMode::Gray2 => ([(r % 4) * 85; 3], 255),
            ColorMode::Gray4 => ([(r % 16) * 17; 3], 255),
            ColorMode::Gray8 | ColorMode::Gray16 => ([r; 3], 255),
            ColorMode::GrayAlpha8 | ColorMode::GrayAlpha16 => ([r; 3], noise[i * 4 + 3]),
            ColorMode::Indexed1 => ([if r & 1 == 0 { 11 } else { 222 }; 3], 255),
            ColorMode::Indexed2 => {
                let c = [[1u8, 2, 3], [40, 50, 60], [70, 80, 90], [200, 210, 220]][r as usize % 4];
                (c, [255, 128, 0, 255][r as usize % 4])
            }
            ColorMode::Indexed4 => ([r % 16, (r % 16) * 2, (r % 16) * 3], 255),
            ColorMode::Indexed8 => ([r, r ^ 0x55, r ^ 0xAA], if r > 128 { 200 } else { 255 }),
            ColorMode::Rgb8 | ColorMode::Rgb16 => {
                ([noise[i * 4], noise[i * 4 + 1], noise[i * 4 + 2]], 255)
            }
            _ => (
                [noise[i * 4], noise[i * 4 + 1], noise[i * 4 + 2]],
                noise[i * 4 + 3],
            ),
        };
        px[0] = p[0];
        px[1] = p[1];
        px[2] = p[2];
        px[3] = a;
    }
    Image {
        data,
        width: w,
        height: h,
    }
}

const ALL_MODES: [ColorMode; 16] = [
    ColorMode::Gray1,
    ColorMode::Gray2,
    ColorMode::Gray4,
    ColorMode::Gray8,
    ColorMode::Gray16,
    ColorMode::GrayAlpha8,
    ColorMode::GrayAlpha16,
    ColorMode::Indexed1,
    ColorMode::Indexed2,
    ColorMode::Indexed4,
    ColorMode::Indexed8,
    ColorMode::Rgb8,
    ColorMode::Rgb16,
    ColorMode::Rgba8,
    ColorMode::Rgba16,
    ColorMode::Auto,
];

#[test]
fn roundtrip_and_cross_decode_full_matrix() {
    let sizes: [(u32, u32); 5] = [(1, 1), (3, 2), (7, 7), (8, 8), (33, 9)];
    let filters = [
        Filter::None,
        Filter::Sub,
        Filter::Up,
        Filter::Average,
        Filter::Paeth,
        Filter::Adaptive,
    ];
    for mode in ALL_MODES {
        for &(w, h) in &sizes {
            let img = image_for_mode(mode, w, h, w * 1000 + h);
            for interlace in [false, true] {
                for filter in filters {
                    for compression in [0u8, 1, 6] {
                        let opts = EncodeOptions {
                            color: mode,
                            compression,
                            filter,
                            interlace,
                        };
                        let label = format!(
                            "{mode:?}/{w}x{h}/interlace={interlace}/{filter:?}/lvl{compression}"
                        );
                        let png = encode(&img, &opts)
                            .unwrap_or_else(|e| panic!("{label}: encode failed: {e}"));

                        let back = decode(&png)
                            .unwrap_or_else(|e| panic!("{label}: own decode failed: {e}"));
                        assert_eq!((back.width, back.height), (w, h), "{label}");
                        assert_eq!(back.data, img.data, "{label}: own round-trip");

                        let (sw, sh, sdata) = oracle(&png);
                        assert_eq!((sw, sh), (w, h), "{label}: spng dims");
                        assert_eq!(sdata, img.data, "{label}: spng cross-decode");
                    }
                }
            }
        }
    }
}

#[test]
fn filter_choice_matches_fixed_and_adaptive() {
    // A singleton choice set must encode byte-identically to the fixed filter,
    // and the full set identically to Adaptive — proving Choice is a faithful
    // generalization, not a separate code path.
    let img = image_for_mode(ColorMode::Rgba8, 17, 11, 3);
    let cases = [
        (Filter::None, FilterSet::NONE),
        (Filter::Sub, FilterSet::SUB),
        (Filter::Up, FilterSet::UP),
        (Filter::Average, FilterSet::AVERAGE),
        (Filter::Paeth, FilterSet::PAETH),
        (Filter::Adaptive, FilterSet::ALL),
    ];
    for (fixed, set) in cases {
        let base = encode(
            &img,
            &EncodeOptions {
                filter: fixed,
                ..Default::default()
            },
        )
        .unwrap();
        let choice = encode(
            &img,
            &EncodeOptions {
                filter: Filter::Choice(set),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(base, choice, "{fixed:?} vs Choice({set:?})");
    }
}

#[test]
fn filter_choice_subsets_roundtrip() {
    // Arbitrary subsets must still produce a valid, losslessly-decodable PNG
    // that spng also reads back identically.
    let img = image_for_mode(ColorMode::Rgba8, 23, 13, 9);
    let subsets = [
        FilterSet::UP | FilterSet::PAETH,
        FilterSet::NONE | FilterSet::SUB | FilterSet::AVERAGE,
        FilterSet::SUB | FilterSet::PAETH,
    ];
    for set in subsets {
        let png = encode(
            &img,
            &EncodeOptions {
                filter: Filter::Choice(set),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(decode(&png).unwrap().data, img.data, "{set:?}");
        let (_, _, sdata) = oracle(&png);
        assert_eq!(sdata, img.data, "{set:?} spng");
    }
}

#[test]
fn out_of_range_compression_is_rejected() {
    let img = image_for_mode(ColorMode::Rgba8, 4, 4, 1);
    let png = encode(
        &img,
        &EncodeOptions {
            compression: 13,
            ..Default::default()
        },
    );
    assert!(png.is_err(), "compression > 12 must be rejected");
}

#[test]
fn unrepresentable_modes_are_rejected() {
    // Non-gray pixels in a gray mode.
    let img = Image {
        data: vec![1, 2, 3, 255],
        width: 1,
        height: 1,
    };
    for mode in [ColorMode::Gray8, ColorMode::Gray16, ColorMode::GrayAlpha8] {
        assert!(encode(
            &img,
            &EncodeOptions {
                color: mode,
                ..Default::default()
            }
        )
        .is_err());
    }
    // Translucent pixel in RGB.
    let img = Image {
        data: vec![1, 1, 1, 9],
        width: 1,
        height: 1,
    };
    assert!(encode(
        &img,
        &EncodeOptions {
            color: ColorMode::Rgb8,
            ..Default::default()
        }
    )
    .is_err());
    // 3 unique colors at depth 1.
    let img = Image {
        data: vec![0, 0, 0, 255, 255, 255, 255, 255, 7, 7, 7, 255],
        width: 3,
        height: 1,
    };
    assert!(encode(
        &img,
        &EncodeOptions {
            color: ColorMode::Indexed1,
            ..Default::default()
        }
    )
    .is_err());
    // Gray value not on the depth-2 lattice.
    let img = Image {
        data: vec![86, 86, 86, 255],
        width: 1,
        height: 1,
    };
    assert!(encode(
        &img,
        &EncodeOptions {
            color: ColorMode::Gray2,
            ..Default::default()
        }
    )
    .is_err());
}

#[test]
fn auto_mode_picks_lossless_modes() {
    // Pure black/white -> gray1; verify by decoding the IHDR.
    let img = Image {
        data: [[0u8, 0, 0, 255], [255, 255, 255, 255]].concat().repeat(8),
        width: 4,
        height: 4,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[24], 1, "bit depth");
    assert_eq!(png[25], 0, "color type gray");
    assert_eq!(decode(&png).unwrap().data, img.data);

    // Translucent multicolor -> still lossless through whatever Auto picks.
    let img = image_for_mode(ColorMode::Rgba8, 9, 9, 99);
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(decode(&png).unwrap().data, img.data);
}

#[test]
fn large_image_levels_and_multiblock_paths() {
    // Big enough (> 4 MB raw) to exercise multi-block defiltering and the
    // multi-block stored stream on encode.
    let img = image_for_mode(ColorMode::Rgba8, 1100, 1300, 7);
    for compression in [0u8, 1, 12] {
        let opts = EncodeOptions {
            compression,
            ..Default::default()
        };
        let png = encode(&img, &opts).unwrap();
        let back = decode(&png).unwrap();
        assert_eq!(back.data, img.data, "lvl {compression}");
        let (_, _, sdata) = oracle(&png);
        assert_eq!(sdata, img.data, "spng lvl {compression}");
    }
}
