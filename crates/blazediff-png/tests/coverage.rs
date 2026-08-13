//! Targeted coverage for reachable branches the format / roundtrip / edge
//! suites don't reach: the borrowed and streaming encode entry points, 16-bit
//! and explicit-palette encode validation, decode format incompatibility, the
//! truecolor tRNS color-key at wide output formats, and invalid-filter
//! rejection. Behavioural — each asserts the observable result, and every
//! decode case stays at spng parity.

use blazediff_png::{
    decode, decode_with, encode, encode16, encode16_with_metadata, encode_ref, encode_to,
    encode_with_metadata, ColorMode, DecodeFormat, DecodeOptions, EncodeOptions, Filter, Image,
    Image16, ImageRef, Metadata, Palette, PngError, Trns,
};

// --- shared builders (mirrors edge.rs's minimal-PNG helpers) --------------

fn chunk(ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut c = (payload.len() as u32).to_be_bytes().to_vec();
    c.extend_from_slice(ty);
    c.extend_from_slice(payload);
    c.extend_from_slice(&[0; 4]); // CRC unchecked by both decoders
    c
}

fn ihdr(w: u32, h: u32, depth: u8, color: u8) -> [u8; 13] {
    let mut p = [0u8; 13];
    p[0..4].copy_from_slice(&w.to_be_bytes());
    p[4..8].copy_from_slice(&h.to_be_bytes());
    p[8] = depth;
    p[9] = color;
    p
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

fn zlib(data: &[u8]) -> Vec<u8> {
    let mut c = libdeflater::Compressor::new(libdeflater::CompressionLvl::default());
    let mut z = vec![0u8; c.zlib_compress_bound(data.len())];
    let n = c.zlib_compress(data, &mut z).unwrap();
    z.truncate(n);
    z
}

fn small_rgba(w: u32, h: u32, seed: u32) -> Image {
    let n = (w * h) as usize;
    let mut data = Vec::with_capacity(n * 4);
    let mut s = seed;
    for _ in 0..n * 4 {
        s = s.wrapping_mul(1664525).wrapping_add(1013904223);
        data.push((s >> 24) as u8);
    }
    Image {
        data,
        width: w,
        height: h,
    }
}

// --- borrowed / streaming encode entry points -----------------------------

#[test]
fn encode_ref_matches_encode() {
    let img = small_rgba(9, 7, 1);
    let opts = EncodeOptions {
        compression: 6,
        filter: Filter::Adaptive,
        ..Default::default()
    };
    let owned = encode(&img, &opts).unwrap();
    let borrowed = encode_ref(ImageRef::from(&img), &opts).unwrap();
    assert_eq!(owned, borrowed, "encode_ref must match encode");
}

#[test]
fn encode_to_non_stored_path_roundtrips() {
    // A non-stored mode forces the buffered-then-write_all branch of encode_to.
    let img = small_rgba(11, 5, 2);
    let opts = EncodeOptions {
        compression: 6,
        filter: Filter::Paeth,
        ..Default::default()
    };
    let mut out = Vec::new();
    encode_to(ImageRef::from(&img), &opts, &mut out).unwrap();
    assert_eq!(decode(&out).unwrap().data, img.data);
}

/// A writer that fails every write — encode's `io::Error` must surface as
/// `PngError::Io(kind)`, and that variant must format.
struct FailWriter;
impl std::io::Write for FailWriter {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "no room",
        ))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn encode_to_writer_error_maps_to_io() {
    let img = small_rgba(4, 4, 3);
    // Stored RGBA8 hot path: the first sink write fails inside write_signature.
    let stored = EncodeOptions {
        color: ColorMode::Rgba8,
        compression: 0,
        filter: Filter::None,
        interlace: false,
    };
    let err = encode_to(ImageRef::from(&img), &stored, &mut FailWriter).unwrap_err();
    assert!(matches!(err, PngError::Io(std::io::ErrorKind::BrokenPipe)));
    assert!(!err.to_string().is_empty());

    // Non-stored path: the failure is on the final write_all of the buffer.
    let buffered = EncodeOptions {
        compression: 6,
        ..Default::default()
    };
    let err = encode_to(ImageRef::from(&img), &buffered, &mut FailWriter).unwrap_err();
    assert!(matches!(err, PngError::Io(_)));
}

// --- 16-bit encode ---------------------------------------------------------

fn image16(w: u32, h: u32, px: &[[u16; 4]]) -> Image16 {
    let data: Vec<u16> = px.iter().flat_map(|p| p.iter().copied()).collect();
    Image16 {
        data,
        width: w,
        height: h,
    }
}

#[test]
fn encode16_with_metadata_carries_gama_and_roundtrips() {
    let src = image16(
        2,
        1,
        &[[1000, 2000, 3000, 65535], [40000, 50000, 60000, 12345]],
    );
    let mut meta = Metadata::default();
    meta.gama = Some(45455);
    let png = encode16_with_metadata(&src, &EncodeOptions::default(), &meta).unwrap();
    let back = decode_with(
        &png,
        &DecodeOptions {
            format: DecodeFormat::Rgba16,
            ..Default::default()
        },
    )
    .unwrap();
    // Rgba16 output is host-order u16 pairs; compare to the source samples.
    let got: Vec<u16> = back
        .data
        .chunks_exact(2)
        .map(|c| u16::from_ne_bytes([c[0], c[1]]))
        .collect();
    assert_eq!(got, src.data);
}

#[test]
fn encode16_rejects_bad_dimensions_and_length() {
    let zero = Image16 {
        data: vec![],
        width: 0,
        height: 1,
    };
    assert!(matches!(
        encode16(&zero, &EncodeOptions::default()),
        Err(PngError::InvalidOptions(_))
    ));
    let bad_len = Image16 {
        data: vec![0u16; 5],
        width: 1,
        height: 1,
    };
    assert!(matches!(
        encode16(&bad_len, &EncodeOptions::default()),
        Err(PngError::InvalidOptions(_))
    ));
}

#[test]
fn encode16_unrepresentable_modes_rejected() {
    let opt = |color| EncodeOptions {
        color,
        ..Default::default()
    };
    // Gray16 needs r==g==b and opaque alpha.
    let translucent_gray = image16(1, 1, &[[5, 5, 5, 1000]]);
    assert!(matches!(
        encode16(&translucent_gray, &opt(ColorMode::Gray16)),
        Err(PngError::Unrepresentable(_))
    ));
    // GrayAlpha16 needs r==g==b.
    let non_gray = image16(1, 1, &[[5, 6, 7, 65535]]);
    assert!(matches!(
        encode16(&non_gray, &opt(ColorMode::GrayAlpha16)),
        Err(PngError::Unrepresentable(_))
    ));
    // Rgb16 needs opaque alpha.
    let translucent_rgb = image16(1, 1, &[[5, 6, 7, 1000]]);
    assert!(matches!(
        encode16(&translucent_rgb, &opt(ColorMode::Rgb16)),
        Err(PngError::Unrepresentable(_))
    ));
}

// --- explicit palette via metadata ----------------------------------------

/// Two-color image; forcing Indexed8 lets an explicit up-to-256-entry palette
/// apply (`spng_set_plte` / `spng_set_trns`). The second color is translucent
/// (alpha 128) so it can match a tRNS palette entry exactly.
fn two_color_indexed_image() -> Image {
    Image {
        data: vec![
            10, 20, 30, 255, 200, 210, 220, 128, 10, 20, 30, 255, 200, 210, 220, 128,
        ],
        width: 2,
        height: 2,
    }
}

#[test]
fn explicit_palette_with_trns_roundtrips() {
    let img = two_color_indexed_image();
    let mut meta = Metadata::default();
    meta.palette = Some(Palette {
        entries: vec![[10, 20, 30], [200, 210, 220], [1, 2, 3]],
    });
    meta.transparency = Some(Trns::Palette(vec![255, 128]));
    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();
    // Entry 1 (the second color) carries alpha 128; decode reflects it.
    let back = decode(&png).unwrap();
    assert_eq!(back.width, 2);
    assert_eq!(&back.data[4..8], &[200, 210, 220, 128]);
}

#[test]
fn explicit_palette_too_large_for_depth_rejected() {
    let img = two_color_indexed_image();
    let mut meta = Metadata::default();
    // 257 entries exceeds the 256 cap regardless of depth.
    meta.palette = Some(Palette {
        entries: (0..257).map(|i| [i as u8, (i >> 1) as u8, 0]).collect(),
    });
    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    assert!(matches!(
        encode_with_metadata(&img, &opts, &meta),
        Err(PngError::InvalidOptions(_))
    ));
}

#[test]
fn explicit_palette_missing_color_rejected() {
    let img = two_color_indexed_image();
    let mut meta = Metadata::default();
    // The second image color (200,210,220) is absent from the palette.
    meta.palette = Some(Palette {
        entries: vec![[10, 20, 30], [99, 99, 99]],
    });
    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    assert!(matches!(
        encode_with_metadata(&img, &opts, &meta),
        Err(PngError::Unrepresentable(_))
    ));
}

/// A full 256-entry palette with pixels touching every index forces the
/// palette hash map's linear-probe path on both insert and lookup.
#[test]
fn full_palette_encode_probes_and_roundtrips() {
    let mut data = Vec::with_capacity(256 * 4);
    for i in 0..256u32 {
        data.extend_from_slice(&[i as u8, (i * 7) as u8, (i * 13) as u8, 255]);
    }
    let img = Image {
        data,
        width: 256,
        height: 1,
    };
    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    let png = encode(&img, &opts).unwrap();
    assert_eq!(png[25], 3, "indexed color type");
    assert_eq!(decode(&png).unwrap().data, img.data);
}

// --- decode format incompatibility ----------------------------------------

#[test]
fn decode_with_incompatible_format_rejected_like_spng() {
    // Truecolor 8-bit image: G8 (grayscale-only) is incompatible (SPNG_EFMT).
    let idat = zlib(&[0, 1, 2, 3, 4, 5, 6, 0, 7, 8, 9, 10, 11, 12]); // 2x2 rgb8
    let png = png_with(ihdr(2, 2, 8, 2), &[], &idat);
    let o = DecodeOptions {
        format: DecodeFormat::G8,
        ..Default::default()
    };
    let err = match decode_with(&png, &o) {
        Err(e) => e,
        Ok(_) => panic!("truecolor at G8 must be rejected"),
    };
    assert_eq!(err, PngError::UnsupportedFormat);
    assert!(!err.to_string().is_empty());
    // spng rejects the same request (fmt SPNG_FMT_G8 = 64).
    assert!(blazediff_shared::decode_spng_reference_fmt(&png, 64, 0).is_err());
}

// --- truecolor tRNS color-key at wide output formats ----------------------

#[track_caller]
fn assert_format_parity(bytes: &[u8], fmt: i32, format: DecodeFormat, label: &str) {
    let mine = decode_with(
        bytes,
        &DecodeOptions {
            format,
            apply_trns: true,
            ..Default::default()
        },
    )
    .ok()
    .map(|d| d.data);
    let spng = blazediff_shared::decode_spng_reference_fmt(bytes, fmt, 1)
        .ok()
        .map(|(_, _, _, _, d)| d);
    assert_eq!(mine, spng, "{label}: tRNS color-key output must match spng");
    assert!(mine.is_some(), "{label}: both should accept");
}

#[test]
fn truecolor_colorkey_matches_spng_at_wide_formats() {
    // RGB8 image with a tRNS key equal to the first pixel (0,1,2). png crate
    // writes the 6-byte (16-bit) key; the low byte is the 8-bit sample.
    let raw = [0u8, 1, 2, 90, 91, 92, 3, 4, 5, 6, 7, 8]; // 2x2 rgb8
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, 2, 2);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_trns(vec![0, 0, 0, 1, 0, 2]); // key = (0,1,2)
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&raw).unwrap();
    }
    // Rgba8 (fmt 1) and Rgba16 (fmt 2) both route truecolor through trns_row.
    assert_format_parity(&out, 1, DecodeFormat::Rgba8, "rgb+trns@rgba8");
    assert_format_parity(&out, 2, DecodeFormat::Rgba16, "rgb+trns@rgba16");
}

// --- invalid scanline filter rejection ------------------------------------

#[track_caller]
fn assert_decode_parity(bytes: &[u8], label: &str) {
    let mine = decode(bytes).ok().map(|i| i.data);
    let spng = blazediff_shared::decode_spng_reference(bytes)
        .ok()
        .map(|i| i.data);
    assert_eq!(mine, spng, "{label}: decoders must agree");
}

#[test]
fn invalid_filter_type_rejected_non_interlaced() {
    // 2x2 gray-8: each scanline is [filter, s0, s1]; filter 5 is invalid.
    let idat = zlib(&[5, 10, 20, 5, 30, 40]);
    let png = png_with(ihdr(2, 2, 8, 0), &[], &idat);
    assert!(matches!(decode(&png), Err(PngError::Filter)));
    assert_decode_parity(&png, "invalid filter non-interlaced");
}

fn gather_idat(png: &[u8]) -> Vec<u8> {
    let mut pos = 8;
    let mut payload = Vec::new();
    while pos + 8 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        let ty = &png[pos + 4..pos + 8];
        if ty == b"IDAT" {
            payload.extend_from_slice(&png[pos + 8..pos + 8 + len]);
        }
        if ty == b"IEND" {
            break;
        }
        pos += 12 + len;
    }
    payload
}

#[test]
fn invalid_filter_type_rejected_interlaced() {
    // Encode a small interlaced image at level 0 (stored, so the deflate
    // payload is literal), then flip the first pass's first filter byte to an
    // invalid value and re-frame. Both decoders must reject via the interlaced
    // defilter path.
    let img = small_rgba(8, 8, 5);
    let opts = EncodeOptions {
        color: ColorMode::Rgba8,
        compression: 0,
        filter: Filter::None,
        interlace: true,
    };
    let png = encode(&img, &opts).unwrap();
    let idat = gather_idat(&png);
    // Decompress the stored zlib stream (generous buffer for a tiny image).
    let mut raw = vec![0u8; 4096];
    let n = libdeflater::Decompressor::new()
        .zlib_decompress(&idat, &mut raw)
        .unwrap();
    raw.truncate(n);
    raw[0] = 5; // first interlaced scanline's filter byte -> invalid
    let mut hdr = ihdr(8, 8, 8, 6);
    hdr[12] = 1; // Adam7
    let bad = png_with(hdr, &[], &zlib(&raw));
    assert!(matches!(decode(&bad), Err(PngError::Filter)));
    assert_decode_parity(&bad, "invalid filter interlaced");
}

#[test]
fn invalid_filter_type_rejected_generic_converter_path() {
    // Forcing a transform (apply_gamma) routes decode through the general
    // RowConverter path rather than the RGBA8 fast expander, exercising its
    // own defilter failure branch.
    let idat = zlib(&[5, 10, 20, 5, 30, 40]);
    let png = png_with(ihdr(2, 2, 8, 0), &[], &idat);
    let o = DecodeOptions {
        format: DecodeFormat::Rgba8,
        apply_trns: true,
        apply_gamma: true,
        apply_sbit: false,
    };
    assert!(matches!(decode_with(&png, &o), Err(PngError::Filter)));
}

// --- general-converter tRNS color-key + gamma ------------------------------

/// Decode both decoders at an explicit (fmt, flags) and require identical
/// output. `flags`: bit0 tRNS, bit1 gamma, bit3 sBIT (spng's decode flags).
#[track_caller]
fn assert_fmt_flags_parity(bytes: &[u8], fmt: i32, opts: DecodeOptions, label: &str) {
    let mine = decode_with(bytes, &opts).ok().map(|d| d.data);
    let mut flags = 0;
    if opts.apply_trns {
        flags |= 1;
    }
    if opts.apply_gamma {
        flags |= 2;
    }
    if opts.apply_sbit {
        flags |= 8;
    }
    let spng = blazediff_shared::decode_spng_reference_fmt(bytes, fmt, flags)
        .ok()
        .map(|(_, _, _, _, d)| d);
    assert_eq!(mine, spng, "{label}: must match spng");
    assert!(mine.is_some(), "{label}: both should accept");
}

#[test]
fn truecolor_colorkey_with_gamma_matches_spng() {
    // RGB 2x2 with gAMA + tRNS; decoding at Rgba8 *with gamma* forces the
    // general converter, whose truecolor trns_row + gamma pass must match spng.
    let raw = vec![0u8, 0, 1, 2, 90, 91, 92, 0, 3, 4, 5, 6, 7, 8];
    let gama = chunk(b"gAMA", &45455u32.to_be_bytes());
    let trns = chunk(b"tRNS", &[0, 0, 0, 1, 0, 2]); // 16-bit key -> (0,1,2)
    let png = png_with(ihdr(2, 2, 8, 2), &[gama, trns], &zlib(&raw));
    let o = |format| DecodeOptions {
        format,
        apply_trns: true,
        apply_gamma: true,
        apply_sbit: false,
    };
    assert_fmt_flags_parity(&png, 1, o(DecodeFormat::Rgba8), "rgb+trns+gamma@rgba8");
    assert_fmt_flags_parity(&png, 2, o(DecodeFormat::Rgba16), "rgb+trns+gamma@rgba16");
}

#[test]
fn gray_colorkey_expanded_to_rgba_matches_spng() {
    // Grayscale color-key expanded to RGBA through the general converter: the
    // matching pixel's alpha is zeroed inline, byte-identically to spng.
    // 8-bit gray + gamma forces the converter (the plain Rgba8 path is the fast
    // expander); 16-bit at Rgba16 always uses the converter.
    let g8 = png_with(
        ihdr(2, 2, 8, 0),
        &[chunk(b"tRNS", &[0, 10])],
        &zlib(&[0, 10, 20, 0, 30, 40]),
    );
    assert_fmt_flags_parity(
        &g8,
        1, // SPNG_FMT_RGBA8
        DecodeOptions {
            format: DecodeFormat::Rgba8,
            apply_trns: true,
            apply_gamma: true,
            apply_sbit: false,
        },
        "gray8+key@rgba8",
    );
    // 16-bit gray, key 10 (0x000A) matches pixel 0. Exercise both the RGBA16
    // path and the gray16 -> RGBA8 downscale (high-byte) path with the key.
    let raw16 = [0, 0, 10, 0, 20, 0, 0, 30, 0, 40];
    let g16 = png_with(
        ihdr(2, 2, 16, 0),
        &[chunk(b"tRNS", &[0, 10])],
        &zlib(&raw16),
    );
    assert_fmt_flags_parity(
        &g16,
        2, // SPNG_FMT_RGBA16
        DecodeOptions {
            format: DecodeFormat::Rgba16,
            apply_trns: true,
            ..Default::default()
        },
        "gray16+key@rgba16",
    );
    assert_fmt_flags_parity(
        &g16,
        1, // SPNG_FMT_RGBA8: gray16 downscaled to 8-bit, key still matches
        DecodeOptions {
            format: DecodeFormat::Rgba8,
            apply_trns: true,
            apply_gamma: true,
            apply_sbit: false,
        },
        "gray16+key@rgba8",
    );
}

// --- explicit palette with collisions and a duplicate entry ---------------

#[test]
fn large_explicit_palette_probes_and_dedups() {
    // 255 distinct gray colors, with a 256-entry palette whose last entry
    // duplicates the first: forces the palette map's linear-probe path and the
    // duplicate-key (last-wins) branch of the explicit-palette build.
    let mut data = Vec::with_capacity(255 * 4);
    for i in 0..255u32 {
        data.extend_from_slice(&[i as u8, i as u8, i as u8, 255]);
    }
    let img = Image {
        data,
        width: 255,
        height: 1,
    };
    let mut entries: Vec<[u8; 3]> = (0..255).map(|i| [i as u8, i as u8, i as u8]).collect();
    entries.push([0, 0, 0]); // duplicate of entry 0 -> 256 entries
    let mut meta = Metadata::default();
    meta.palette = Some(Palette { entries });
    let opts = EncodeOptions {
        color: ColorMode::Indexed8,
        ..Default::default()
    };
    let png = encode_with_metadata(&img, &opts, &meta).unwrap();
    assert_eq!(decode(&png).unwrap().data, img.data);
}
