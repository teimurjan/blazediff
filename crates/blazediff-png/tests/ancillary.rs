//! Differential sweep over ancillary chunk handling: every standard chunk
//! type spliced pre-IDAT in valid and malformed variants. None of these
//! affect pixels; what's verified is spng's accept/discard/reject behavior
//! (non-strict mode discards malformed ancillary chunks, fatal only on
//! limits) — byte-for-byte against the oracle.

use blazediff_png::decode;

fn oracle(bytes: &[u8]) -> Option<Vec<u8>> {
    blazediff::decode_spng_reference(bytes).ok().map(|i| i.data)
}

#[track_caller]
fn assert_parity(bytes: &[u8], label: &str) {
    match (decode(bytes), oracle(bytes)) {
        (Ok(m), Some(data)) => assert_eq!(m.data, data, "{label}: pixel mismatch"),
        (Err(_), None) => {}
        (Ok(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (Err(e), None_) => panic!("{label}: blazediff_png rejects ({e}), spng {None_:?}"),
    }
}

fn chunk(ty: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut c = (payload.len() as u32).to_be_bytes().to_vec();
    c.extend_from_slice(ty);
    c.extend_from_slice(payload);
    c.extend_from_slice(&[0; 4]); // CRC unchecked by both decoders
    c
}

/// A valid 2x2 RGB base image; chunks are spliced at offset 33 (after IHDR).
fn base() -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, 2, 2);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
            .unwrap();
    }
    out
}

fn spliced(chunks: &[Vec<u8>]) -> Vec<u8> {
    let mut out = base();
    let flat: Vec<u8> = chunks.iter().flatten().copied().collect();
    out.splice(33..33, flat);
    out
}

fn zlib(data: &[u8]) -> Vec<u8> {
    let mut c = libdeflater::Compressor::new(libdeflater::CompressionLvl::default());
    let mut z = vec![0u8; c.zlib_compress_bound(data.len())];
    let n = c.zlib_compress(data, &mut z).unwrap();
    z.truncate(n);
    z
}

#[test]
fn standard_chunks_valid_and_malformed() {
    let mut gama_ok = 45455u32.to_be_bytes().to_vec();
    let cases: Vec<(&str, Vec<u8>)> = vec![
        (
            "cHRM ok",
            chunk(
                b"cHRM",
                &[0u8; 32].map({
                    let mut i = 0;
                    move |_| {
                        i += 1;
                        i
                    }
                }),
            ),
        ),
        ("cHRM high bit", {
            let mut p = vec![0u8; 32];
            p[0] = 0x80;
            chunk(b"cHRM", &p)
        }),
        ("gAMA ok", chunk(b"gAMA", &gama_ok)),
        ("gAMA zero", chunk(b"gAMA", &[0; 4])),
        ("sBIT ok rgb", chunk(b"sBIT", &[8, 8, 8])),
        ("sBIT zero bit", chunk(b"sBIT", &[0, 8, 8])),
        ("sBIT too deep", chunk(b"sBIT", &[9, 8, 8])),
        ("sRGB ok", chunk(b"sRGB", &[0])),
        ("sRGB bad intent", chunk(b"sRGB", &[4])),
        ("bKGD ok rgb", chunk(b"bKGD", &[0, 1, 0, 2, 0, 3])),
        ("bKGD wrong size", chunk(b"bKGD", &[0, 1])),
        ("hIST without plte", chunk(b"hIST", &[0, 1, 0, 2])),
        ("pHYs ok", chunk(b"pHYs", &[0, 0, 1, 0, 0, 0, 1, 0, 1])),
        (
            "pHYs bad unit",
            chunk(b"pHYs", &[0, 0, 1, 0, 0, 0, 1, 0, 2]),
        ),
        ("tIME ok", chunk(b"tIME", &[7, 230, 6, 11, 12, 30, 45])),
        (
            "tIME bad month",
            chunk(b"tIME", &[7, 230, 13, 11, 12, 30, 45]),
        ),
        (
            "tIME second 60",
            chunk(b"tIME", &[7, 230, 6, 11, 12, 30, 60]),
        ),
        ("oFFs ok", chunk(b"oFFs", &[0, 0, 0, 1, 0, 0, 0, 1, 0])),
        (
            "oFFs bad unit",
            chunk(b"oFFs", &[0, 0, 0, 1, 0, 0, 0, 1, 9]),
        ),
        ("eXIf ok le", chunk(b"eXIf", &[73, 73, 42, 0, 1, 2])),
        ("eXIf ok be", chunk(b"eXIf", &[77, 77, 0, 42])),
        ("eXIf bad magic", chunk(b"eXIf", &[1, 2, 3, 4])),
        ("eXIf short", chunk(b"eXIf", &[73, 73])),
        ("tEXt ok", chunk(b"tEXt", b"Title\0hello world")),
        ("tEXt empty text", chunk(b"tEXt", b"Title\0")),
        ("tEXt no nul", chunk(b"tEXt", b"no separator here")),
        ("tEXt bad keyword", chunk(b"tEXt", b" lead\0v")),
        ("zTXt ok", {
            let mut p = b"Comment\0\0".to_vec();
            p.extend_from_slice(&zlib(b"compressed text"));
            chunk(b"zTXt", &p)
        }),
        ("zTXt bad method", chunk(b"zTXt", b"Comment\0\x05xx")),
        ("zTXt bad stream", chunk(b"zTXt", b"Comment\0\0notzlib")),
        ("zTXt empty stream", {
            let mut p = b"Comment\0\0".to_vec();
            p.extend_from_slice(&zlib(b""));
            chunk(b"zTXt", &p)
        }),
        (
            "iTXt ok uncompressed",
            chunk(b"iTXt", b"Key\0\0\0en\0K\0text"),
        ),
        ("iTXt ok compressed", {
            let mut p = b"Key\0\x01\0en\0K\0".to_vec();
            p.extend_from_slice(&zlib(b"intl text"));
            chunk(b"iTXt", &p)
        }),
        ("iTXt bad flag", chunk(b"iTXt", b"Key\0\x02\0en\0K\0text")),
        ("iTXt no lang nul", chunk(b"iTXt", b"Key\0\0\0enenenen")),
        ("sPLT ok 8", chunk(b"sPLT", b"name\0\x08abcdef")),
        ("sPLT ok 16", chunk(b"sPLT", b"name\0\x10abcdefghij")),
        ("sPLT bad depth", chunk(b"sPLT", b"name\0\x07abcdef")),
        ("sPLT misaligned", chunk(b"sPLT", b"name\0\x08abcde")),
        ("sPLT no nul", chunk(b"sPLT", b"name")),
        ("iCCP ok", {
            let mut p = b"profile\0\0".to_vec();
            p.extend_from_slice(&zlib(&[0u8; 128]));
            chunk(b"iCCP", &p)
        }),
        ("iCCP bad method", chunk(b"iCCP", b"profile\0\x01xx")),
        ("iCCP bad stream", chunk(b"iCCP", b"profile\0\0junk")),
        ("unknown ancillary", chunk(b"abcd", &[1, 2, 3])),
        ("zero length unknown", chunk(b"abcd", &[])),
    ];
    gama_ok.clear();

    for (label, c) in &cases {
        assert_parity(&spliced(std::slice::from_ref(c)), label);
    }

    // All valid chunks together, then duplicates of each (dup discard path).
    let all: Vec<Vec<u8>> = cases.iter().map(|(_, c)| c.clone()).collect();
    assert_parity(&spliced(&all), "all chunks spliced together");
    let doubled: Vec<Vec<u8>> = cases
        .iter()
        .flat_map(|(_, c)| [c.clone(), c.clone()])
        .collect();
    assert_parity(&spliced(&doubled), "every chunk duplicated");
}

/// Chunks positioned after PLTE that spng requires before it (discarded),
/// on an indexed image.
#[test]
fn position_sensitive_chunks_after_plte() {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, 2, 2);
        enc.set_color(png::ColorType::Indexed);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_palette(vec![1, 2, 3, 4, 5, 6]);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[0, 1, 1, 0]).unwrap();
    }
    let plte = {
        // find PLTE end
        let mut pos = 8;
        loop {
            let len = u32::from_be_bytes(out[pos..pos + 4].try_into().unwrap()) as usize;
            if &out[pos + 4..pos + 8] == b"PLTE" {
                break pos + 12 + len;
            }
            pos += 12 + len;
        }
    };
    for (label, c) in [
        ("gAMA after PLTE", chunk(b"gAMA", &45455u32.to_be_bytes())),
        ("cHRM after PLTE", chunk(b"cHRM", &[0; 32])),
        ("sRGB after PLTE", chunk(b"sRGB", &[0])),
        ("sBIT after PLTE", chunk(b"sBIT", &[8, 8, 8])),
        ("iCCP after PLTE", chunk(b"iCCP", b"p\0\0x")),
        ("hIST ok after PLTE", chunk(b"hIST", &[0, 1, 0, 2])),
        ("bKGD ok after PLTE", chunk(b"bKGD", &[1])),
        ("bKGD bad index", chunk(b"bKGD", &[5])),
    ] {
        let mut spliced = out.clone();
        spliced.splice(plte..plte, c);
        assert_parity(&spliced, label);
    }
}

/// The 256-byte peek horizon: iTXt fields that sit beyond the peek are
/// discarded by spng even though they'd be spec-valid.
#[test]
fn text_peek_horizon() {
    // Keyword 79 bytes + fields pushing the language tag NUL past byte 256.
    let mut payload = vec![b'k'; 79];
    payload.push(0);
    payload.push(0); // compression flag
    payload.push(0); // method
    payload.extend_from_slice(&[b'l'; 200]); // language tag, no NUL in peek
    payload.push(0);
    payload.push(0);
    payload.push(b't');
    assert_parity(
        &spliced(&[chunk(b"iTXt", &payload)]),
        "iTXt language tag beyond peek",
    );

    // tEXt with a keyword NUL at exactly byte 80 (outside the 80-byte
    // keyword search window).
    let mut payload = vec![b'k'; 80];
    payload.push(0);
    payload.push(b'v');
    assert_parity(&spliced(&[chunk(b"tEXt", &payload)]), "keyword nul at 80");
}
