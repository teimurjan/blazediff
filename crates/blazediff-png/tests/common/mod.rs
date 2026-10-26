//! Oracles, the parity contract and PNG builders shared by the integration
//! tests. The contract has three rules (see README, "Parity contract"):
//!
//! - Rule A, [`assert_valid`]: a valid PNG decodes to the same RGBA8 as spng
//!   and as image-rs `png`, on every backend. Where spng breaks the PNG spec,
//!   [`assert_valid_unlike_spng`] holds blazediff_png to image-rs alone.
//! - Rule B, [`assert_chunk_parity`]: chunk-level handling of malformed files
//!   matches spng exactly, on every backend (that code is pure Rust).
//! - Rule C, [`assert_stream_contract`]: malformed deflate streams match spng
//!   exactly on `zlib-backend`. Other backends may reject more or accept
//!   more, but when both decoders accept, the pixels must be identical.

#![allow(dead_code)]

use blazediff_png::{decode, ColorMode, Image};
use std::io::Cursor;

pub type Decoded = Option<(u32, u32, Vec<u8>)>;

pub fn mine(bytes: &[u8]) -> Decoded {
    decode(bytes).ok().map(|i| (i.width, i.height, i.data))
}

pub fn spng(bytes: &[u8]) -> Decoded {
    blazediff_shared::decode_spng_reference(bytes)
        .ok()
        .map(|i| (i.width, i.height, i.data))
}

/// image-rs `png` to RGBA8: the independent second oracle. Strict by default
/// (CRC checked), so only meaningful for valid input.
pub fn image_rs(bytes: &[u8]) -> Decoded {
    use png::{ColorType, Transformations};
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(
        Transformations::EXPAND | Transformations::STRIP_16 | Transformations::ALPHA,
    );
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()?];
    let info = reader.next_frame(&mut buf).ok()?;
    buf.truncate(info.buffer_size());
    let rgba = match info.color_type {
        ColorType::Rgba => buf,
        ColorType::GrayscaleAlpha => buf
            .chunks_exact(2)
            .flat_map(|ga| [ga[0], ga[0], ga[0], ga[1]])
            .collect(),
        other => panic!("image-rs: unexpected output color {other:?}"),
    };
    Some((info.width, info.height, rgba))
}

/// True if both decoders give the same verdict across heap perturbation.
/// Classic zlib (which both link on `zlib-backend`) tolerates too-far-back
/// distances at scanline gate boundaries and then copies from uninitialized
/// window memory, so some corrupted streams have no deterministic decode.
/// Such inputs carry no contract.
pub fn stable_under_heap_perturbation(bytes: &[u8], ours: &Decoded, reference: &Decoded) -> bool {
    for pattern in [0xAAu8, 0x55] {
        let scrub: Vec<Vec<u8>> = (0..8)
            .map(|i| vec![pattern; (1 << 15) + (i << 9)])
            .collect();
        std::hint::black_box(&scrub);
        drop(scrub);
        if &mine(bytes) != ours || &spng(bytes) != reference {
            return false;
        }
    }
    true
}

/// Dimension and pixel equality, reporting the first differing pixel instead
/// of dumping both buffers.
#[track_caller]
pub fn assert_same_pixels(
    ours: &(u32, u32, Vec<u8>),
    reference: &(u32, u32, Vec<u8>),
    label: &str,
    oracle: &str,
) {
    let (w, h, data) = ours;
    let (rw, rh, rdata) = reference;
    assert_eq!((w, h), (rw, rh), "{label}: dimension mismatch vs {oracle}");
    assert_eq!(
        data.len(),
        rdata.len(),
        "{label}: length mismatch vs {oracle}"
    );
    if let Some(i) = data.iter().zip(rdata).position(|(a, b)| a != b) {
        let px = i / 4;
        let x = px % *w as usize;
        let y = px / *w as usize;
        let at = px * 4..px * 4 + 4;
        panic!(
            "{label}: pixel ({x},{y}) differs vs {oracle}: ours {:?}, {oracle} {:?}",
            &data[at.clone()],
            &rdata[at]
        );
    }
}

/// Rule A: valid input decodes identically through blazediff_png, spng and
/// image-rs.
#[track_caller]
pub fn assert_valid(bytes: &[u8], label: &str) {
    let ours = mine(bytes).unwrap_or_else(|| {
        let e = decode(bytes).err();
        panic!("{label}: blazediff_png rejects a valid PNG ({e:?})")
    });
    let spng = spng(bytes).unwrap_or_else(|| panic!("{label}: spng rejects a valid PNG"));
    let image_rs =
        image_rs(bytes).unwrap_or_else(|| panic!("{label}: image-rs rejects a valid PNG"));
    assert_same_pixels(&ours, &spng, label, "spng");
    assert_same_pixels(&ours, &image_rs, label, "image-rs");
}

/// Rule A for the inputs where blazediff_png follows the PNG spec instead of
/// spng (today only a gray tRNS key with bits above the bit depth): the
/// output must match image-rs.
#[track_caller]
pub fn assert_valid_unlike_spng(bytes: &[u8], label: &str) {
    let ours = mine(bytes).unwrap_or_else(|| {
        let e = decode(bytes).err();
        panic!("{label}: blazediff_png rejects a valid PNG ({e:?})")
    });
    let image_rs =
        image_rs(bytes).unwrap_or_else(|| panic!("{label}: image-rs rejects a valid PNG"));
    assert_same_pixels(&ours, &image_rs, label, "image-rs");
}

/// Rule B: identical accept/reject and identical pixels on accept.
#[track_caller]
pub fn assert_chunk_parity(bytes: &[u8], label: &str) {
    let ours = mine(bytes);
    let reference = spng(bytes);
    if ours == reference || !stable_under_heap_perturbation(bytes, &ours, &reference) {
        return;
    }
    match (&ours, &reference) {
        (Some(o), Some(r)) => assert_same_pixels(o, r, label, "spng"),
        (Some(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (None, Some(_)) => {
            let e = decode(bytes).err();
            panic!("{label}: blazediff_png rejects ({e:?}), spng accepts");
        }
        (None, None) => unreachable!("equal verdicts returned early"),
    }
}

/// Rule C: exact parity on `zlib-backend`; elsewhere only "both accept means
/// identical pixels".
#[track_caller]
pub fn assert_stream_contract(bytes: &[u8], label: &str) {
    if cfg!(feature = "zlib-backend") {
        return assert_chunk_parity(bytes, label);
    }
    let ours = mine(bytes);
    let reference = spng(bytes);
    let (Some(o), Some(r)) = (&ours, &reference) else {
        return;
    };
    if o != r && stable_under_heap_perturbation(bytes, &ours, &reference) {
        assert_same_pixels(o, r, label, "spng");
    }
}

// --- builders ---

/// A chunk with a zero CRC (neither decoder checks CRCs).
pub fn chunk(ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut c = (payload.len() as u32).to_be_bytes().to_vec();
    c.extend_from_slice(ty);
    c.extend_from_slice(payload);
    c.extend_from_slice(&[0; 4]);
    c
}

/// A chunk with a correct CRC, for input image-rs must accept.
pub fn chunk_with_crc(ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut c = (payload.len() as u32).to_be_bytes().to_vec();
    c.extend_from_slice(ty);
    c.extend_from_slice(payload);
    c.extend_from_slice(&crc32(&[&ty[..], payload].concat()).to_be_bytes());
    c
}

pub fn ihdr(w: u32, h: u32, depth: u8, color: u8) -> [u8; 13] {
    let mut p = [0u8; 13];
    p[0..4].copy_from_slice(&w.to_be_bytes());
    p[4..8].copy_from_slice(&h.to_be_bytes());
    p[8] = depth;
    p[9] = color;
    p
}

pub fn png_with(ihdr: [u8; 13], chunks: &[Vec<u8>], idat: &[u8]) -> Vec<u8> {
    let mut out = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    out.extend_from_slice(&chunk(b"IHDR", &ihdr));
    for c in chunks {
        out.extend_from_slice(c);
    }
    out.extend_from_slice(&chunk(b"IDAT", idat));
    out.extend_from_slice(&chunk(b"IEND", &[]));
    out
}

pub fn zlib(data: &[u8]) -> Vec<u8> {
    let mut c = libdeflater::Compressor::new(libdeflater::CompressionLvl::default());
    let mut z = vec![0u8; c.zlib_compress_bound(data.len())];
    let n = c.zlib_compress(data, &mut z).unwrap();
    z.truncate(n);
    z
}

/// Bit-serial CRC-32/ISO-HDLC (PNG/zlib polynomial).
pub fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

pub fn lcg_bytes(n: usize, mut seed: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        v.push((seed >> 24) as u8);
    }
    v
}

/// Pack 8-bit-per-sample values into sub-byte rows (MSB-first, row padded).
pub fn pack_rows(samples: &[u8], width: usize, height: usize, depth: u8) -> Vec<u8> {
    let row_bytes = (width * depth as usize).div_ceil(8);
    let mut out = vec![0u8; row_bytes * height];
    for y in 0..height {
        for x in 0..width {
            let s = samples[y * width + x] & ((1u16 << depth) as u8).wrapping_sub(1);
            let bit = x * depth as usize;
            out[y * row_bytes + bit / 8] |= s << (8 - depth as usize - bit % 8);
        }
    }
    out
}

/// Author a PNG with image-rs `png`.
#[allow(clippy::too_many_arguments)]
pub fn png_encode(
    raw: &[u8],
    width: u32,
    height: u32,
    color: png::ColorType,
    depth: png::BitDepth,
    filter: png::Filter,
    palette: Option<&[u8]>,
    trns: Option<&[u8]>,
) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, width, height);
        enc.set_color(color);
        enc.set_depth(depth);
        enc.set_filter(filter);
        if let Some(plte) = palette {
            enc.set_palette(plte.to_vec());
        }
        if let Some(t) = trns {
            enc.set_trns(t.to_vec());
        }
        let mut w = enc.write_header().unwrap();
        w.write_image_data(raw).unwrap();
    }
    out
}

/// Offset of the first chunk of type `ty`.
pub fn find_chunk(bytes: &[u8], ty: &[u8; 4]) -> usize {
    let mut pos = 8;
    loop {
        let len = u32::from_be_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        if &bytes[pos + 4..pos + 8] == ty {
            return pos;
        }
        pos += 12 + len;
    }
}

/// An image representable in the given mode (so the round-trip is lossless).
pub fn image_for_mode(mode: ColorMode, w: u32, h: u32, seed: u32) -> Image {
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

pub const ALL_MODES: [ColorMode; 16] = [
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
