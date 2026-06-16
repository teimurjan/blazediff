//! Metadata round-trip: `encode_with_metadata` → `decode_with_metadata`
//! recovers every chunk, and spng accepts the output (validity oracle).

use blazediff_png::{
    decode_with_metadata, encode_with_metadata, Bkgd, Chrm, ColorMode, EncodeOptions, Iccp, Image,
    Location, Metadata, Offs, Palette, Phys, Sbit, Splt, SpltEntry, Text, TextKind, Time, Trns,
    UnknownChunk,
};

fn spng_pixels(bytes: &[u8]) -> (u32, u32, Vec<u8>) {
    let img = blazediff::decode_spng_reference(bytes).expect("spng must accept our output");
    (img.width, img.height, img.data)
}

fn rgba_image(w: u32, h: u32) -> Image {
    let mut data = Vec::with_capacity((w * h) as usize * 4);
    for i in 0..(w * h) {
        let v = (i * 7) as u8;
        data.extend_from_slice(&[v, v.wrapping_add(40), v.wrapping_add(80), 255]);
    }
    Image {
        data,
        width: w,
        height: h,
    }
}

#[test]
fn full_metadata_roundtrip_truecolor_alpha() {
    let img = rgba_image(4, 4);
    let meta = Metadata {
        chrm: Some(Chrm {
            white_x: 31270,
            white_y: 32900,
            red_x: 64000,
            red_y: 33000,
            green_x: 30000,
            green_y: 60000,
            blue_x: 15000,
            blue_y: 6000,
        }),
        gama: Some(45455),
        srgb: Some(0),
        sbit: Some(Sbit {
            red: 5,
            green: 6,
            blue: 5,
            alpha: 8,
            grayscale: 0,
        }),
        text: vec![
            Text {
                kind: TextKind::Text,
                keyword: b"Title".to_vec(),
                text: b"Blaze".to_vec(),
                compressed: false,
                language_tag: vec![],
                translated_keyword: vec![],
            },
            Text {
                kind: TextKind::Ztxt,
                keyword: b"Comment".to_vec(),
                text: b"compressed comment payload, repeated repeated repeated".to_vec(),
                compressed: true,
                language_tag: vec![],
                translated_keyword: vec![],
            },
            Text {
                kind: TextKind::Itxt,
                keyword: b"Author".to_vec(),
                text: "unicode ☃ author".as_bytes().to_vec(),
                compressed: true,
                language_tag: b"en".to_vec(),
                translated_keyword: "Auteur".as_bytes().to_vec(),
            },
        ],
        bkgd: Some(Bkgd::Rgb(257, 514, 771)),
        phys: Some(Phys {
            ppu_x: 2835,
            ppu_y: 2835,
            unit: 1,
        }),
        splt: vec![Splt {
            name: b"suggested".to_vec(),
            sample_depth: 8,
            entries: vec![
                SpltEntry {
                    red: 10,
                    green: 20,
                    blue: 30,
                    alpha: 255,
                    frequency: 5,
                },
                SpltEntry {
                    red: 200,
                    green: 100,
                    blue: 50,
                    alpha: 128,
                    frequency: 1,
                },
            ],
        }],
        time: Some(Time {
            year: 2026,
            month: 6,
            day: 11,
            hour: 9,
            minute: 30,
            second: 15,
        }),
        offs: Some(Offs {
            x: -12,
            y: 34,
            unit: 1,
        }),
        exif: Some([b"II".as_slice(), &[42, 0, 8, 0, 0, 0]].concat()),
        unknown: vec![
            UnknownChunk {
                kind: *b"prVt",
                data: vec![1, 2, 3],
                location: Location::AfterIhdr,
            },
            UnknownChunk {
                kind: *b"prVt",
                data: vec![9, 9],
                location: Location::AfterIdat,
            },
        ],
        ..Default::default()
    };

    let opts = EncodeOptions {
        color: ColorMode::Rgba8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();

    let out = decode_with_metadata(&png).unwrap();
    assert_eq!(out.image.data, img.data, "pixels round-trip");
    assert_eq!(out.meta, meta, "metadata round-trip");

    // spng must accept the metadata-laden stream and decode the same pixels.
    let (w, h, px) = spng_pixels(&png);
    assert_eq!((w, h), (4, 4));
    assert_eq!(px, img.data, "spng cross-decode");
}

#[test]
fn indexed_metadata_roundtrip_preserves_palette_order() {
    // Two colors used by pixels, plus an unused trailing palette entry to
    // prove explicit palette order + extra entries survive.
    let colors = [[10u8, 20, 30], [200, 100, 50], [0, 0, 0]];
    let mut data = Vec::new();
    for i in 0..16u32 {
        let c = colors[(i % 2) as usize];
        // entry 0 is translucent via tRNS; keep alpha consistent with tRNS.
        let a = if (i % 2) == 0 { 128 } else { 255 };
        data.extend_from_slice(&[c[0], c[1], c[2], a]);
    }
    let img = Image {
        data,
        width: 4,
        height: 4,
    };

    let meta = Metadata {
        palette: Some(Palette {
            entries: colors.to_vec(),
        }),
        transparency: Some(Trns::Palette(vec![128])), // entry 0 alpha
        bkgd: Some(Bkgd::Palette(1)),
        hist: Some(vec![5, 3, 0]),
        sbit: Some(Sbit {
            red: 8,
            green: 8,
            blue: 8,
            alpha: 0,
            grayscale: 0,
        }),
        text: vec![Text {
            kind: TextKind::Text,
            keyword: b"Software".to_vec(),
            text: b"blazediff".to_vec(),
            compressed: false,
            language_tag: vec![],
            translated_keyword: vec![],
        }],
        unknown: vec![UnknownChunk {
            kind: *b"prVt",
            data: vec![7],
            location: Location::AfterPlte,
        }],
        ..Default::default()
    };

    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();

    let out = decode_with_metadata(&png).unwrap();
    assert_eq!(out.image.data, img.data, "indexed pixels round-trip");
    assert_eq!(out.meta.palette, meta.palette, "palette order preserved");
    assert_eq!(out.meta.transparency, meta.transparency, "tRNS preserved");
    assert_eq!(out.meta.bkgd, meta.bkgd);
    assert_eq!(out.meta.hist, meta.hist);
    assert_eq!(out.meta.text, meta.text);
    assert_eq!(out.meta.unknown, meta.unknown);

    let (_, _, px) = spng_pixels(&png);
    assert_eq!(px, img.data, "spng cross-decode indexed");
}

#[test]
fn iccp_roundtrip_gray() {
    let img = Image {
        data: vec![128, 128, 128, 255],
        width: 1,
        height: 1,
    };
    let meta = Metadata {
        iccp: Some(Iccp {
            name: b"ICC".to_vec(),
            profile: b"fake-but-decompressible-profile-bytes".repeat(4),
        }),
        ..Default::default()
    };
    let opts = EncodeOptions {
        color: ColorMode::Gray8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();

    let out = decode_with_metadata(&png).unwrap();
    assert_eq!(
        out.meta.iccp, meta.iccp,
        "iCCP decompressed profile round-trip"
    );
    spng_pixels(&png); // spng accepts the iCCP stream
}

#[test]
fn empty_metadata_matches_plain_encode() {
    let img = rgba_image(3, 3);
    // Force a non-palette mode so no PLTE is emitted (which decode would
    // otherwise faithfully capture into meta.palette).
    let opts = EncodeOptions {
        color: ColorMode::Rgba8,
        ..Default::default()
    };
    let with = encode_with_metadata(&img, &opts, &Metadata::default()).unwrap();
    let plain = blazediff_png::encode(&img, &opts).unwrap();
    assert_eq!(with, plain, "no metadata -> identical to plain encode");

    let out = decode_with_metadata(&with).unwrap();
    assert!(out.meta.is_empty(), "no chunks captured");
}

#[test]
fn gray_color_key_trns_roundtrips() {
    // A gray color-key tRNS is metadata-only; pixels may change on decode, so
    // only assert the captured tRNS, not pixel equality.
    let img = Image {
        data: vec![0, 0, 0, 255, 255, 255, 255, 255],
        width: 2,
        height: 1,
    };
    let meta = Metadata {
        transparency: Some(Trns::Gray(0)),
        ..Default::default()
    };
    let opts = EncodeOptions {
        color: ColorMode::Gray8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();
    let out = decode_with_metadata(&png).unwrap();
    assert_eq!(out.meta.transparency, Some(Trns::Gray(0)));
}
