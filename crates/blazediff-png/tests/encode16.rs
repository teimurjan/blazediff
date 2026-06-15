//! Phase 2 — true 16-bit encode. `encode16` must carry full 16-bit precision:
//! `decode_with(Rgba16)` round-trips the source exactly, and spng cross-decodes
//! at `SPNG_FMT_RGBA16` to the same bytes.

use blazediff_png::{
    decode_with, encode16, ColorMode, DecodeFormat, DecodeOptions, EncodeOptions, Image16, PngError,
};

fn lcg_u16(n: usize, mut seed: u32) -> Vec<u16> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        v.push((seed >> 16) as u16);
    }
    v
}

/// RGBA16 source variants satisfying each mode's lossless constraints.
fn sources(w: u32, h: u32, seed: u32) -> Vec<(Image16, ColorMode, &'static str)> {
    let n = (w * h) as usize;
    let mk = |data: Vec<u16>| Image16 {
        data,
        width: w,
        height: h,
    };

    let rgba = lcg_u16(n * 4, seed);

    let rgb: Vec<u16> = lcg_u16(n * 4, seed ^ 1)
        .chunks_exact(4)
        .flat_map(|p| [p[0], p[1], p[2], 65535])
        .collect();

    let ga: Vec<u16> = lcg_u16(n * 2, seed ^ 2)
        .chunks_exact(2)
        .flat_map(|p| [p[0], p[0], p[0], p[1]])
        .collect();

    let gray: Vec<u16> = lcg_u16(n, seed ^ 3)
        .iter()
        .flat_map(|&g| [g, g, g, 65535])
        .collect();

    vec![
        (mk(rgba), ColorMode::Rgba16, "rgba16"),
        (mk(rgb), ColorMode::Rgb16, "rgb16"),
        (mk(ga), ColorMode::GrayAlpha16, "ga16"),
        (mk(gray), ColorMode::Gray16, "gray16"),
    ]
}

fn decoded_u16(png: &[u8]) -> (u32, u32, Vec<u16>) {
    let d = decode_with(
        png,
        &DecodeOptions {
            format: DecodeFormat::Rgba16,
            ..Default::default()
        },
    )
    .expect("decode_with rgba16");
    let u16s = d
        .data
        .chunks_exact(2)
        .map(|b| u16::from_ne_bytes([b[0], b[1]]))
        .collect();
    (d.width, d.height, u16s)
}

#[test]
fn encode16_roundtrips_and_matches_spng() {
    let sizes = [(1u32, 1u32), (3, 2), (7, 5), (8, 8), (9, 4)];
    for &(w, h) in &sizes {
        for (img, explicit, name) in sources(w, h, w * 1000 + h) {
            // Each source encodes losslessly via Auto, its explicit mode, and
            // the always-valid Rgba16.
            for (mode, mlabel) in [
                (ColorMode::Auto, "auto"),
                (explicit, "explicit"),
                (ColorMode::Rgba16, "rgba16"),
            ] {
                for compression in [0u8, 6] {
                    for interlace in [false, true] {
                        let opts = EncodeOptions {
                            color: mode,
                            compression,
                            filter: blazediff_png::Filter::Adaptive,
                            interlace,
                        };
                        let label =
                            format!("{name}/{mlabel}/lvl{compression}/il{interlace}/{w}x{h}");
                        let png = encode16(&img, &opts)
                            .unwrap_or_else(|e| panic!("{label}: encode {e:?}"));

                        // Round-trip through our own RGBA16 decode.
                        let (dw, dh, data) = decoded_u16(&png);
                        assert_eq!((dw, dh), (w, h), "{label}: dims");
                        assert_eq!(data, img.data, "{label}: roundtrip mismatch");

                        // Cross-decode through spng at SPNG_FMT_RGBA16.
                        let (sw, sh, _, _, sbytes) =
                            blazediff::decode_spng_reference_fmt(&png, 2, 0)
                                .unwrap_or_else(|e| panic!("{label}: spng rejects: {e:?}"));
                        let sdata: Vec<u16> = sbytes
                            .chunks_exact(2)
                            .map(|b| u16::from_ne_bytes([b[0], b[1]]))
                            .collect();
                        assert_eq!((sw, sh), (w, h), "{label}: spng dims");
                        assert_eq!(sdata, img.data, "{label}: spng mismatch");
                    }
                }
            }
        }
    }
}

/// The whole point of Phase 2: samples with distinct high/low bytes (which an
/// 8-bit byte-replicating encoder cannot represent) survive intact.
#[test]
fn encode16_preserves_sub_byte_precision() {
    let data: Vec<u16> = vec![
        0x1234, 0x1234, 0x1234, 0xFFFF, 0xABCD, 0x00FF, 0x8001, 0x1357,
    ];
    let img = Image16 {
        data: data.clone(),
        width: 2,
        height: 1,
    };
    let png = encode16(&img, &EncodeOptions::default()).unwrap();
    let (_, _, out) = decoded_u16(&png);
    assert_eq!(out, data, "16-bit precision lost");
    // Confirm at least one sample really has hi != lo (would alias under 8-bit).
    assert!(data.iter().any(|&v| (v >> 8) != (v & 0xFF)));
}

#[test]
fn encode16_rejects_narrow_and_unrepresentable_modes() {
    let img = Image16 {
        data: vec![1, 2, 3, 65535], // not grayscale (r != g)
        width: 1,
        height: 1,
    };
    // 8-bit output mode is not allowed from a 16-bit source.
    assert!(matches!(
        encode16(
            &img,
            &EncodeOptions {
                color: ColorMode::Rgba8,
                ..Default::default()
            }
        ),
        Err(PngError::InvalidOptions(_))
    ));
    // Gray16 on non-gray data is unrepresentable.
    assert!(matches!(
        encode16(
            &img,
            &EncodeOptions {
                color: ColorMode::Gray16,
                ..Default::default()
            }
        ),
        Err(PngError::Unrepresentable(_))
    ));
}
