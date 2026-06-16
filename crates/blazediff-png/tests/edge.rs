//! Edge cases targeting the remaining uncovered branches: IHDR limits,
//! palette-chunk size violations, per-color-type sBIT/bKGD/tRNS variants,
//! sPLT/zTXt/iTXt malformations, IDAT walker boundaries, and encoder
//! option validation. Differential against spng wherever the input is a
//! decode case.

use blazediff_png::{decode, encode, ColorMode, EncodeOptions, Image, PngError};

#[track_caller]
fn assert_parity(bytes: &[u8], label: &str) {
    let mine = decode(bytes);
    let spng = blazediff::decode_spng_reference(bytes).ok();
    match (&mine, &spng) {
        (Ok(m), Some(s)) => assert_eq!(m.data, s.data, "{label}: pixel mismatch"),
        (Err(_), None) => {}
        (Ok(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (Err(e), Some(_)) => panic!("{label}: blazediff_png rejects ({e}), spng accepts"),
    }
}

fn chunk(ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut c = (payload.len() as u32).to_be_bytes().to_vec();
    c.extend_from_slice(ty);
    c.extend_from_slice(payload);
    c.extend_from_slice(&[0; 4]);
    c
}

fn png_with(ihdr: [u8; 13], chunks: &[Vec<u8>], idat: &[u8]) -> Vec<u8> {
    let mut out = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    out.extend_from_slice(&chunk(b"IHDR", &ihdr));
    for c in chunks {
        out.extend_from_slice(c);
    }
    out.extend_from_slice(&chunk(b"IDAT", idat));
    out.extend_from_slice(&chunk(b"IEND", &[]));
    out
}

fn ihdr(w: u32, h: u32, depth: u8, color: u8) -> [u8; 13] {
    let mut p = [0u8; 13];
    p[0..4].copy_from_slice(&w.to_be_bytes());
    p[4..8].copy_from_slice(&h.to_be_bytes());
    p[8] = depth;
    p[9] = color;
    p
}

fn zlib(data: &[u8]) -> Vec<u8> {
    let mut c = libdeflater::Compressor::new(libdeflater::CompressionLvl::default());
    let mut z = vec![0u8; c.zlib_compress_bound(data.len())];
    let n = c.zlib_compress(data, &mut z).unwrap();
    z.truncate(n);
    z
}

/// 2x2 gray-8 image stream (filter 0 rows).
fn gray2x2_idat() -> Vec<u8> {
    zlib(&[0, 10, 20, 0, 30, 40])
}

#[test]
fn ihdr_limits() {
    // height 0
    assert_parity(
        &png_with(ihdr(2, 0, 8, 0), &[], &gray2x2_idat()),
        "height 0",
    );
    // width 0
    assert_parity(&png_with(ihdr(0, 2, 8, 0), &[], &gray2x2_idat()), "width 0");
    // dimensions above 2^31-1
    assert_parity(
        &png_with(ihdr(0x8000_0000, 2, 8, 0), &[], &gray2x2_idat()),
        "width over i32::MAX",
    );
    // scanline width overflow: 2^31-1 px RGBA16 rows exceed u32 bytes
    assert_parity(
        &png_with(ihdr(0x7FFF_FFFF, 1, 16, 6), &[], &gray2x2_idat()),
        "scanline width overflow",
    );
    // bad bit depth / color type combos
    assert_parity(&png_with(ihdr(2, 2, 3, 0), &[], &gray2x2_idat()), "depth 3");
    assert_parity(
        &png_with(ihdr(2, 2, 4, 2), &[], &gray2x2_idat()),
        "rgb depth 4",
    );
    assert_parity(
        &png_with(ihdr(2, 2, 16, 3), &[], &gray2x2_idat()),
        "indexed 16",
    );
    assert_parity(
        &png_with(ihdr(2, 2, 8, 7), &[], &gray2x2_idat()),
        "color type 7",
    );
    // interlace method 2
    let mut p = ihdr(2, 2, 8, 0);
    p[12] = 2;
    assert_parity(&png_with(p, &[], &gray2x2_idat()), "interlace 2");

    // Truncated mid-IHDR: signature + correct chunk header only.
    let mut short = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    short.extend_from_slice(&[0, 0, 0, 13]);
    short.extend_from_slice(b"IHDR");
    short.extend_from_slice(&[0, 0, 0, 2, 0, 0]);
    assert_parity(&short, "truncated IHDR payload");
    // First chunk has wrong length for IHDR and the file is short.
    let mut wrong = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    wrong.extend_from_slice(&[0, 0, 0, 5]);
    wrong.extend_from_slice(b"IHDR");
    assert_parity(&wrong, "short IHDR length");
}

#[test]
fn plte_size_violations() {
    let idat = zlib(&[0u8, 0, 0]); // 2x2 1-bit indexed-ish stream (won't be reached)
    for (label, plte_len) in [
        ("empty PLTE", 0usize),
        ("769-byte PLTE", 769),
        ("non-multiple", 4),
    ] {
        let plte = chunk(b"PLTE", &vec![1u8; plte_len]);
        assert_parity(&png_with(ihdr(2, 2, 8, 3), &[plte], &idat), label);
    }
    // Indexed depth 1 with more than 2 entries: spng rejects (n > 1<<depth).
    let plte = chunk(b"PLTE", &[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert_parity(
        &png_with(ihdr(2, 2, 1, 3), &[plte], &idat),
        "3 entries at depth 1",
    );
}

#[test]
fn per_color_type_ancillary_variants() {
    // Gray image: sBIT (1 byte), tRNS wrong sizes, zero-length gAMA.
    let gray = |chunks: &[Vec<u8>]| png_with(ihdr(2, 2, 8, 0), chunks, &gray2x2_idat());
    assert_parity(&gray(&[chunk(b"sBIT", &[8])]), "sBIT gray ok");
    assert_parity(&gray(&[chunk(b"sBIT", &[0])]), "sBIT gray zero");
    assert_parity(&gray(&[chunk(b"sBIT", &[9])]), "sBIT gray too deep");
    assert_parity(&gray(&[chunk(b"tRNS", &[0, 10])]), "tRNS gray ok");
    assert_parity(&gray(&[chunk(b"tRNS", &[10])]), "tRNS gray wrong size");
    assert_parity(
        &gray(&[chunk(b"tRNS", &[0, 10]), chunk(b"tRNS", &[0, 20])]),
        "tRNS duplicate",
    );
    assert_parity(&gray(&[chunk(b"gAMA", &[])]), "zero-length gAMA");
    assert_parity(
        &gray(&[chunk(b"bKGD", &[0, 1, 2, 3, 4, 5])]),
        "bKGD gray wrong size",
    );

    // Gray+alpha image: sBIT 2 bytes, tRNS forbidden.
    let ga_idat = zlib(&[0, 10, 200, 20, 100, 0, 30, 50, 40, 25]);
    let ga = |chunks: &[Vec<u8>]| png_with(ihdr(2, 2, 8, 4), chunks, &ga_idat);
    assert_parity(&ga(&[chunk(b"sBIT", &[8, 8])]), "sBIT ga ok");
    assert_parity(&ga(&[chunk(b"sBIT", &[8, 0])]), "sBIT ga zero alpha bits");
    assert_parity(&ga(&[chunk(b"tRNS", &[0, 1])]), "tRNS on gray-alpha");

    // RGBA image: sBIT 4 bytes, tRNS forbidden.
    let rgba_idat = zlib(&[0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15, 16]);
    let rgba = |chunks: &[Vec<u8>]| png_with(ihdr(2, 2, 8, 6), chunks, &rgba_idat);
    assert_parity(&rgba(&[chunk(b"sBIT", &[8, 8, 8, 8])]), "sBIT rgba ok");
    assert_parity(
        &rgba(&[chunk(b"sBIT", &[8, 8, 8, 9])]),
        "sBIT rgba too deep",
    );
    assert_parity(
        &rgba(&[chunk(b"tRNS", &[0, 1, 0, 2, 0, 3])]),
        "tRNS on rgba",
    );

    // RGB image: tRNS wrong size.
    let rgb_idat = zlib(&[0, 1, 2, 3, 4, 5, 6, 0, 7, 8, 9, 10, 11, 12]);
    let rgb = |chunks: &[Vec<u8>]| png_with(ihdr(2, 2, 8, 2), chunks, &rgb_idat);
    assert_parity(
        &rgb(&[chunk(b"tRNS", &[0, 1, 0, 2])]),
        "tRNS rgb wrong size",
    );

    // Indexed image: bKGD variants before/after PLTE, wrong sizes.
    let plte = chunk(b"PLTE", &[1, 2, 3, 4, 5, 6]);
    let idx_idat = zlib(&[0u8, 0b0100_0000, 0, 0b1000_0000]); // 2x2 1-bit
    let idx = |chunks: &[Vec<u8>]| png_with(ihdr(2, 2, 1, 3), chunks, &idx_idat);
    assert_parity(
        &idx(&[chunk(b"bKGD", &[0]), plte.clone()]),
        "bKGD before PLTE",
    );
    assert_parity(
        &idx(&[plte.clone(), chunk(b"bKGD", &[0, 1])]),
        "bKGD indexed wrong size",
    );
    assert_parity(
        &idx(&[plte.clone(), chunk(b"hIST", &[0, 1, 0, 2])]),
        "hIST ok",
    );
    assert_parity(
        &idx(&[plte.clone(), chunk(b"hIST", &[0, 1])]),
        "hIST wrong count",
    );
    assert_parity(
        &idx(&[
            plte.clone(),
            chunk(b"hIST", &[0, 1, 0, 2]),
            chunk(b"hIST", &[0, 1, 0, 2]),
        ]),
        "hIST duplicate",
    );
}

#[test]
fn splt_and_text_malformations() {
    let base = |c: Vec<u8>| png_with(ihdr(2, 2, 8, 0), &[c], &gray2x2_idat());
    // sPLT: bad keyword char, minimal sizes, zero entries.
    assert_parity(
        &base(chunk(b"sPLT", b"ba\x01d\0\x08abcdef")),
        "sPLT bad keyword char",
    );
    assert_parity(&base(chunk(b"sPLT", b"n\0\x08")), "sPLT len-nul == 2");
    assert_parity(&base(chunk(b"sPLT", b"n\0")), "sPLT no depth byte");
    // zero-length tEXt and zTXt
    assert_parity(&base(chunk(b"tEXt", &[])), "zero-length tEXt");
    assert_parity(&base(chunk(b"zTXt", &[])), "zero-length zTXt");
    // zTXt with valid-but-truncated zlib stream (input exhausted mid-stream)
    let full = zlib(&vec![7u8; 4096]);
    let mut p = b"Comment\0\0".to_vec();
    p.extend_from_slice(&full[..full.len() / 2]);
    assert_parity(&base(chunk(b"zTXt", &p)), "zTXt truncated stream");
    // zTXt where keyword NUL leaves <= 2 peek bytes
    let mut p = vec![b'k'; 253];
    p.push(0);
    p.push(0);
    p.push(1);
    assert_parity(&base(chunk(b"zTXt", &p)), "zTXt keyword at peek edge");
    // iTXt: method byte nonzero, missing translated-keyword NUL
    assert_parity(
        &base(chunk(b"iTXt", b"Key\0\0\x01en\0K\0t")),
        "iTXt bad method",
    );
    assert_parity(
        &base(chunk(b"iTXt", b"Key\0\0\0en\0Knonul")),
        "iTXt no tk nul",
    );
    assert_parity(&base(chunk(b"iTXt", b"Key\0\0\0")), "iTXt minimal fields");
    // iCCP: keyword without NUL, keyword too long, payload too short.
    assert_parity(&base(chunk(b"iCCP", &[b'p'; 90])), "iCCP no nul");
    let mut p = vec![b'p'; 80];
    p.push(0);
    p.push(0);
    p.push(1);
    assert_parity(&base(chunk(b"iCCP", &p)), "iCCP 80-byte keyword");
    assert_parity(&base(chunk(b"iCCP", b"p\0")), "iCCP len < nul+2");
    let mut p = b"profile\0\0".to_vec();
    let full = zlib(&vec![3u8; 2048]);
    p.extend_from_slice(&full[..full.len() / 2]);
    assert_parity(&base(chunk(b"iCCP", &p)), "iCCP truncated stream");
}

#[test]
fn idat_walker_boundaries() {
    // Stream split across two IDATs where the second chunk's header is
    // truncated / has an oversized length, with the stream still hungry.
    let stream = zlib(&[0u8, 10, 20, 0, 30, 40]);
    let split = stream.len() / 2;

    let mut base = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    base.extend_from_slice(&chunk(b"IHDR", &ihdr(2, 2, 8, 0)));
    base.extend_from_slice(&(split as u32).to_be_bytes());
    base.extend_from_slice(b"IDAT");
    base.extend_from_slice(&stream[..split]);
    base.extend_from_slice(&[0; 4]); // CRC

    // (a) file ends right after the first chunk
    assert_parity(&base, "stream hungry, file ends");
    // (b) second header present but length > 2^31
    let mut huge = base.clone();
    huge.extend_from_slice(&0xFFFF_FFFFu32.to_be_bytes());
    huge.extend_from_slice(b"IDAT");
    assert_parity(&huge, "second IDAT stdlen");
    // (c) second chunk truncated payload
    let mut trunc = base.clone();
    trunc.extend_from_slice(&1000u32.to_be_bytes());
    trunc.extend_from_slice(b"IDAT");
    trunc.extend_from_slice(&stream[split..]);
    assert_parity(&trunc, "second IDAT truncated");
    // (d) valid continuation for reference
    let mut ok = base;
    ok.extend_from_slice(&((stream.len() - split) as u32).to_be_bytes());
    ok.extend_from_slice(b"IDAT");
    ok.extend_from_slice(&stream[split..]);
    ok.extend_from_slice(&[0; 4]);
    assert_parity(&ok, "valid split baseline");
}

#[test]
fn remaining_discard_branches() {
    let base = |c: Vec<u8>| png_with(ihdr(2, 2, 8, 0), &[c], &gray2x2_idat());
    // pHYs with the high bit set in ppu
    let mut p = vec![0u8; 9];
    p[0] = 0x80;
    assert_parity(&base(chunk(b"pHYs", &p)), "pHYs ppu high bit");
    // zero-length eXIf / iCCP / sPLT (not in spng's "small chunk" set, so
    // they reach their handlers' own length checks)
    assert_parity(&base(chunk(b"eXIf", &[])), "zero-length eXIf");
    assert_parity(&base(chunk(b"iCCP", &[])), "zero-length iCCP");
    assert_parity(&base(chunk(b"sPLT", &[])), "zero-length sPLT");
    // zTXt where the keyword NUL leaves exactly 2 peek bytes
    let mut p = vec![b'k'; 79];
    p.push(0);
    p.push(0);
    assert_parity(&base(chunk(b"zTXt", &p)), "zTXt 2 bytes after keyword");
    // iTXt whose language-tag NUL is the last peeked byte
    let mut p = b"K   ".to_vec();
    p.extend_from_slice(&vec![b'l'; 251]);
    p.push(0);
    assert_parity(&base(chunk(b"iTXt", &p)), "iTXt lang nul at peek end");
}

#[test]
fn encoder_option_validation() {
    let img = Image {
        data: vec![0; 4],
        width: 1,
        height: 1,
    };
    let bad_dims = Image {
        data: vec![],
        width: 0,
        height: 1,
    };
    assert!(matches!(
        encode(&bad_dims, &EncodeOptions::default()),
        Err(PngError::InvalidOptions(_))
    ));
    let bad_len = Image {
        data: vec![0; 7],
        width: 1,
        height: 1,
    };
    assert!(matches!(
        encode(&bad_len, &EncodeOptions::default()),
        Err(PngError::InvalidOptions(_))
    ));
    let opts = EncodeOptions {
        compression: 13,
        ..Default::default()
    };
    assert!(matches!(
        encode(&img, &opts),
        Err(PngError::InvalidOptions(_))
    ));

    // Gray with translucent alpha is unrepresentable.
    let translucent = Image {
        data: vec![5, 5, 5, 9],
        width: 1,
        height: 1,
    };
    let opts = EncodeOptions {
        color: ColorMode::Gray8,
        ..Default::default()
    };
    assert!(matches!(
        encode(&translucent, &opts),
        Err(PngError::Unrepresentable(_))
    ));
}

#[test]
fn auto_mode_variants() {
    // Gray2 lattice picks depth 2.
    let img = Image {
        data: [
            [0u8, 0, 0, 255],
            [85, 85, 85, 255],
            [170, 170, 170, 255],
            [255, 255, 255, 255],
        ]
        .concat(),
        width: 2,
        height: 2,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[24], 2, "depth 2");
    assert_eq!(decode(&png).unwrap().data, img.data);

    // Gray + translucent -> GrayAlpha8.
    let img = Image {
        data: vec![7, 7, 7, 100, 9, 9, 9, 255],
        width: 2,
        height: 1,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(decode(&png).unwrap().data, img.data);

    // Opaque, >256 unique colors -> Rgb8.
    let mut data = Vec::new();
    for i in 0..300u32 {
        data.extend_from_slice(&[
            (i % 256) as u8,
            (i / 256) as u8 * 37 + 1,
            (i % 251) as u8,
            255,
        ]);
    }
    let img = Image {
        data,
        width: 300,
        height: 1,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[25], 2, "rgb");
    assert_eq!(decode(&png).unwrap().data, img.data);

    // Translucent, >256 unique colors -> Rgba8.
    let mut data = Vec::new();
    for i in 0..300u32 {
        data.extend_from_slice(&[(i % 256) as u8, (i / 7) as u8, (i % 13) as u8, 254]);
    }
    let img = Image {
        data,
        width: 300,
        height: 1,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[25], 6, "rgba");
    assert_eq!(decode(&png).unwrap().data, img.data);
}

#[test]
fn auto_mode_gray_depths_and_gray_alpha() {
    // Gray4 lattice (multiples of 17, not all multiples of 85).
    let img = Image {
        data: [
            [17u8, 17, 17, 255],
            [34, 34, 34, 255],
            [51, 51, 51, 255],
            [68, 68, 68, 255],
        ]
        .concat(),
        width: 2,
        height: 2,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[24], 4, "depth 4");
    assert_eq!(decode(&png).unwrap().data, img.data);

    // Arbitrary grays -> Gray8.
    let img = Image {
        data: vec![3, 3, 3, 255, 200, 200, 200, 255],
        width: 2,
        height: 1,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[24], 8, "depth 8");
    assert_eq!((png[25], decode(&png).unwrap().data), (0, img.data));

    // Gray + alpha with > 256 unique (gray, alpha) combinations -> GrayAlpha8.
    let mut data = Vec::new();
    for i in 0..300u32 {
        let g = (i % 256) as u8;
        let a = ((i * 7) % 255) as u8;
        data.extend_from_slice(&[g, g, g, a]);
    }
    let img = Image {
        data,
        width: 300,
        height: 1,
    };
    let png = encode(&img, &EncodeOptions::default()).unwrap();
    assert_eq!(png[25], 4, "gray alpha");
    assert_eq!(decode(&png).unwrap().data, img.data);
}

#[test]
fn error_display_covers_all_variants() {
    let errors = [
        PngError::Signature,
        PngError::NoIhdr,
        PngError::InvalidIhdr,
        PngError::UnexpectedEof,
        PngError::ChunkStdLen,
        PngError::ChunkPos,
        PngError::ChunkSize,
        PngError::UnknownCritical,
        PngError::NoPlte,
        PngError::ChunkLimits,
        PngError::IdatTooShort,
        PngError::IdatStream,
        PngError::Filter,
        PngError::OutOfMemory,
        PngError::Overflow,
        PngError::Unrepresentable("x"),
        PngError::InvalidOptions("y"),
    ];
    for e in errors {
        assert!(!e.to_string().is_empty());
    }
}
