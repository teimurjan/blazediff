//! Every chunk in an encoded PNG must carry a correct CRC-32. The decode paths
//! ignore CRCs (spng parity), so nothing else in the suite would catch a broken
//! encoder CRC — this checks each chunk against an independent, dependency-free
//! reference implementation, so it holds regardless of which backend's CRC
//! kernel (libdeflate vs crc32fast) produced the bytes.

use blazediff_png::{encode, ColorMode, EncodeOptions, Filter, Image};

/// Bit-serial CRC-32/ISO-HDLC (PNG/zlib polynomial), independent of the codec.
fn crc32_ref(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
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

/// Walk the chunk stream and assert every stored CRC matches the reference over
/// `type ++ payload`. Also returns the chunk-type sequence for a sanity check.
#[track_caller]
fn verify_chunk_crcs(png: &[u8]) -> Vec<[u8; 4]> {
    assert_eq!(
        &png[..8],
        &[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n']
    );
    let mut pos = 8;
    let mut types = Vec::new();
    while pos + 12 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        let ty: [u8; 4] = png[pos + 4..pos + 8].try_into().unwrap();
        let crc_off = pos + 8 + len;
        let stored = u32::from_be_bytes(png[crc_off..crc_off + 4].try_into().unwrap());
        let want = crc32_ref(&png[pos + 4..crc_off]); // type + payload
        assert_eq!(
            stored,
            want,
            "chunk {} CRC {:#010x} != reference {:#010x}",
            String::from_utf8_lossy(&ty),
            stored,
            want
        );
        types.push(ty);
        pos = crc_off + 4;
    }
    assert_eq!(pos, png.len(), "trailing bytes after last chunk");
    types
}

fn image(w: u32, h: u32, seed: u32) -> Image {
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

/// Reference Adler-32 (zlib), independent of the codec.
fn adler32_ref(data: &[u8]) -> u32 {
    let (mut a, mut b) = (1u32, 0u32);
    for &x in data {
        a = (a + x as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

fn concat_idat(png: &[u8]) -> Vec<u8> {
    let mut pos = 8;
    let mut out = Vec::new();
    while pos + 12 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        if &png[pos + 4..pos + 8] == b"IDAT" {
            out.extend_from_slice(&png[pos + 8..pos + 8 + len]);
        }
        pos += 12 + len;
    }
    out
}

#[test]
fn stored_zlib_adler_trailer_is_correct() {
    // Stored RGBA8 (Filter::None): the raw deflate stream is [0 ++ row] per row,
    // and the IDAT zlib stream's 4-byte trailer is Adler-32 over exactly that.
    // Decoders ignore the trailer, so verify it against an independent Adler.
    for (w, h) in [(3u32, 2u32), (512, 41)] {
        let img = image(w, h, w * 17 + h);
        let opts = EncodeOptions {
            color: ColorMode::Rgba8,
            compression: 0,
            filter: Filter::None,
            interlace: false,
        };
        let png = encode(&img, &opts).unwrap();
        let mut raw = Vec::with_capacity((1 + w as usize * 4) * h as usize);
        for row in img.data.chunks_exact(w as usize * 4) {
            raw.push(0); // filter byte
            raw.extend_from_slice(row);
        }
        let idat = concat_idat(&png);
        let trailer = u32::from_be_bytes(idat[idat.len() - 4..].try_into().unwrap());
        assert_eq!(
            trailer,
            adler32_ref(&raw),
            "{w}x{h}: adler trailer mismatch"
        );
    }
}

#[test]
fn every_chunk_crc_is_correct() {
    // Cover the stored RGBA8 hot path (multi-block IDAT), the generic level-6
    // path, and a size that splits the stored stream across many 0xffff blocks.
    let cases = [
        (
            EncodeOptions {
                color: ColorMode::Rgba8,
                compression: 0,
                filter: Filter::None,
                interlace: false,
            },
            3u32,
            2u32,
        ),
        (
            EncodeOptions {
                color: ColorMode::Rgba8,
                compression: 0,
                filter: Filter::None,
                interlace: false,
            },
            512,
            41,
        ),
        (
            EncodeOptions {
                color: ColorMode::Auto,
                compression: 6,
                filter: Filter::Adaptive,
                interlace: false,
            },
            64,
            48,
        ),
        (
            EncodeOptions {
                color: ColorMode::Auto,
                compression: 6,
                filter: Filter::Adaptive,
                interlace: true,
            },
            40,
            40,
        ),
    ];
    for (opts, w, h) in cases {
        let png = encode(&image(w, h, w * 131 + h), &opts).unwrap();
        let types = verify_chunk_crcs(&png);
        assert_eq!(types.first(), Some(&*b"IHDR"));
        assert_eq!(types.last(), Some(&*b"IEND"));
        assert!(types.iter().any(|t| t == b"IDAT"), "must have an IDAT");
    }
}
