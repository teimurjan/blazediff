//! Differential tests against the spng reference decoder (the parity
//! oracle): every input must produce identical accept/reject behavior, and
//! byte-identical RGBA8 on accept.

use blazediff_png::decode;

fn oracle(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    blazediff::decode_spng_reference(bytes)
        .ok()
        .map(|img| (img.width, img.height, img.data))
}

fn snapshot(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    decode(bytes).ok().map(|i| (i.width, i.height, i.data))
}

/// True if both decoders are self-consistent across heap perturbation for
/// this input. classic zlib (which both link) tolerates too-far-back
/// distances at scanline gate boundaries and then copies from uninitialized
/// window memory, so a minority of corrupted streams have no deterministic
/// decode — their accept/reject and bytes vary with heap state. Such inputs
/// carry no behavioral contract; the differential fuzzer skips them via the
/// strict-window classifier, and the test suite must too or it can flake.
fn stable_under_heap_perturbation(
    bytes: &[u8],
    mine: &Option<(u32, u32, Vec<u8>)>,
    spng: &Option<(u32, u32, Vec<u8>)>,
) -> bool {
    for pattern in [0xAAu8, 0x55] {
        let scrub: Vec<Vec<u8>> = (0..8)
            .map(|i| vec![pattern; (1 << 15) + (i << 9)])
            .collect();
        std::hint::black_box(&scrub);
        drop(scrub);
        if &snapshot(bytes) != mine || &oracle(bytes) != spng {
            return false;
        }
    }
    true
}

#[track_caller]
fn assert_parity(bytes: &[u8], label: &str) {
    let mine = snapshot(bytes);
    let spng = oracle(bytes);
    if mine == spng {
        return;
    }
    // Disagreement: only a real divergence if it survives heap perturbation.
    if !stable_under_heap_perturbation(bytes, &mine, &spng) {
        return;
    }
    match (&mine, &spng) {
        (Some((w, h, data)), Some((sw, sh, sdata))) => {
            assert_eq!((w, h), (sw, sh), "{label}: dimension mismatch");
            assert_eq!(data, sdata, "{label}: pixel mismatch");
        }
        (Some(_), None) => panic!("{label}: blazediff_png accepts, spng rejects"),
        (None, Some(_)) => {
            let e = decode(bytes).err();
            panic!("{label}: blazediff_png rejects ({e:?}), spng accepts");
        }
        (None, None) => unreachable!("equal verdicts returned early"),
    }
}

fn lcg_bytes(n: usize, mut seed: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(n);
    for _ in 0..n {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        v.push((seed >> 24) as u8);
    }
    v
}

/// Pack 8-bit-per-sample values into sub-byte rows (MSB-first, row padded).
fn pack_rows(samples: &[u8], width: usize, height: usize, depth: u8) -> Vec<u8> {
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

#[allow(clippy::too_many_arguments)]
fn png_crate_encode(
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

const FILTERS: [png::Filter; 6] = [
    png::Filter::NoFilter,
    png::Filter::Sub,
    png::Filter::Up,
    png::Filter::Avg,
    png::Filter::Paeth,
    png::Filter::Adaptive,
];

/// Exhaustive small-image matrix: every color type x bit depth x filter x
/// tRNS combination the png crate can author, at sizes stressing sub-byte
/// row padding and tiny images.
#[test]
fn matrix_parity_with_spng() {
    use png::{BitDepth, ColorType};

    // (width, height) pairs: 1x1, odd widths for bit packing, 7x7, 8x8.
    let sizes: [(u32, u32); 6] = [(1, 1), (3, 2), (5, 3), (7, 7), (8, 8), (33, 9)];

    for &(w, h) in &sizes {
        let n = (w * h) as usize;
        let seed = w * 100 + h;

        // --- grayscale, depths 1/2/4/8/16, with and without tRNS keys ---
        for depth in [1u8, 2, 4, 8, 16] {
            let samples = lcg_bytes(n, seed);
            let raw = match depth {
                16 => lcg_bytes(n * 2, seed ^ 1),
                8 => samples.clone(),
                d => pack_rows(&samples, w as usize, h as usize, d),
            };
            let bd = match depth {
                1 => BitDepth::One,
                2 => BitDepth::Two,
                4 => BitDepth::Four,
                8 => BitDepth::Eight,
                _ => BitDepth::Sixteen,
            };
            for filter in FILTERS {
                let label = format!("gray{depth}/{filter:?}/{w}x{h}");
                let bytes =
                    png_crate_encode(&raw, w, h, ColorType::Grayscale, bd, filter, None, None);
                assert_parity(&bytes, &label);

                // tRNS gray key: a value guaranteed present and one out of
                // range for the depth (never matches).
                let present = (samples[0] & ((1u16 << depth.min(8)) as u8).wrapping_sub(1)) as u16;
                for key in [present, 0x0100 | present] {
                    let bytes = png_crate_encode(
                        &raw,
                        w,
                        h,
                        ColorType::Grayscale,
                        bd,
                        filter,
                        None,
                        Some(&key.to_be_bytes()),
                    );
                    assert_parity(&bytes, &format!("{label}/trns={key:#x}"));
                }
            }
        }

        // --- truecolor 8/16 with and without tRNS ---
        for depth in [8u8, 16] {
            let raw = lcg_bytes(n * 3 * depth as usize / 8, seed ^ 2);
            let bd = if depth == 8 {
                BitDepth::Eight
            } else {
                BitDepth::Sixteen
            };
            for filter in FILTERS {
                let label = format!("rgb{depth}/{filter:?}/{w}x{h}");
                let bytes = png_crate_encode(&raw, w, h, ColorType::Rgb, bd, filter, None, None);
                assert_parity(&bytes, &label);

                // Key matching the first pixel; for 8-bit also a key with
                // nonzero high bytes (spng masks with 0xFF).
                let mut key = [0u8; 6];
                if depth == 16 {
                    key.copy_from_slice(&raw[0..6]);
                } else {
                    key[1] = raw[0];
                    key[3] = raw[1];
                    key[5] = raw[2];
                }
                let bytes = png_crate_encode(
                    &bytes_to_owned(&raw),
                    w,
                    h,
                    ColorType::Rgb,
                    bd,
                    filter,
                    None,
                    Some(&key),
                );
                assert_parity(&bytes, &format!("{label}/trns-match"));

                if depth == 8 {
                    key[0] = 0xAB; // high byte ignored by spng's mask
                    let bytes =
                        png_crate_encode(&raw, w, h, ColorType::Rgb, bd, filter, None, Some(&key));
                    assert_parity(&bytes, &format!("{label}/trns-himask"));
                }
            }
        }

        // --- gray+alpha and RGBA, 8/16 ---
        for depth in [8u8, 16] {
            let bd = if depth == 8 {
                BitDepth::Eight
            } else {
                BitDepth::Sixteen
            };
            for (color, ch) in [(ColorType::GrayscaleAlpha, 2usize), (ColorType::Rgba, 4)] {
                let raw = lcg_bytes(n * ch * depth as usize / 8, seed ^ 3);
                for filter in FILTERS {
                    let bytes = png_crate_encode(&raw, w, h, color, bd, filter, None, None);
                    assert_parity(&bytes, &format!("{color:?}{depth}/{filter:?}/{w}x{h}"));
                }
            }
        }

        // --- indexed, depths 1/2/4/8, partial/full palettes, tRNS ---
        for depth in [1u8, 2, 4, 8] {
            let n_colors = 1usize << depth;
            let plte_full = lcg_bytes(n_colors * 3, seed ^ 4);
            let plte_partial = lcg_bytes((n_colors / 2).max(1) * 3, seed ^ 5);
            let trns = lcg_bytes((n_colors / 2).max(1), seed ^ 6);
            let bd = match depth {
                1 => BitDepth::One,
                2 => BitDepth::Two,
                4 => BitDepth::Four,
                _ => BitDepth::Eight,
            };
            let mut indices = lcg_bytes(n, seed ^ 7);
            if n_colors < 256 {
                for i in &mut indices {
                    *i %= n_colors as u8;
                }
            }
            let raw = if depth == 8 {
                indices.clone()
            } else {
                pack_rows(&indices, w as usize, h as usize, depth)
            };
            for filter in FILTERS {
                let label = format!("indexed{depth}/{filter:?}/{w}x{h}");
                for (plte, t) in [
                    (&plte_full, None),
                    (&plte_partial, None),
                    (&plte_full, Some(&trns[..])),
                ] {
                    let bytes =
                        png_crate_encode(&raw, w, h, ColorType::Indexed, bd, filter, Some(plte), t);
                    assert_parity(&bytes, &format!("{label}/plte={}", plte.len() / 3));
                }
            }
        }
    }
}

fn bytes_to_owned(b: &[u8]) -> Vec<u8> {
    b.to_vec()
}

/// 16 -> 8 reduction must be truncation of the high byte (spng `>> 8`), not
/// rounding: exercise values whose low bytes differ.
#[test]
fn sixteen_bit_reduction_is_truncation() {
    let (w, h) = (4u32, 1u32);
    // Pairs (hi, lo): lo must be ignored entirely.
    let raw: Vec<u8> = [
        (0x12, 0xFF),
        (0x12, 0x00),
        (0xFF, 0x80),
        (0x00, 0xFF),
        (0x80, 0x7F),
        (0x80, 0x80),
        (0x7F, 0xFF),
        (0x01, 0x01),
    ]
    .iter()
    .flat_map(|&(hi, lo)| [hi, lo])
    .collect();
    let bytes = png_crate_encode(
        &raw,
        w,
        h,
        png::ColorType::GrayscaleAlpha,
        png::BitDepth::Sixteen,
        png::Filter::NoFilter,
        None,
        None,
    );
    assert_parity(&bytes, "16->8 truncation");
    let img = decode(&bytes).unwrap();
    assert_eq!(&img.data[..4], &[0x12, 0x12, 0x12, 0x12]);
    assert_eq!(&img.data[4..8], &[0xFF, 0xFF, 0xFF, 0x00]);
    assert_eq!(&img.data[8..12], &[0x80, 0x80, 0x80, 0x80]);
}

/// Palette indices beyond the PLTE decode as opaque black, exactly like
/// spng's pre-processed 256-entry LUT.
#[test]
fn palette_index_out_of_range_matches_spng() {
    let plte = [10u8, 20, 30, 40, 50, 60];
    let raw = [0u8, 1, 5, 1];
    let bytes = png_crate_encode(
        &raw,
        2,
        2,
        png::ColorType::Indexed,
        png::BitDepth::Eight,
        png::Filter::NoFilter,
        Some(&plte),
        None,
    );
    assert_parity(&bytes, "palette index out of range");
}

/// spng quirks around stream framing: these MUST be accepted.
#[test]
fn stream_framing_quirks_match_spng() {
    let raw = lcg_bytes(8 * 8 * 3, 17);
    let valid = png_crate_encode(
        &raw,
        8,
        8,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        png::Filter::Paeth,
        None,
        None,
    );
    assert_parity(&valid, "baseline");

    // Missing IEND: spng never reads past the IDAT run.
    let iend = find_chunk(&valid, b"IEND");
    assert_parity(&valid[..iend], "missing IEND");

    // Trailing garbage after IEND.
    let mut garbage = valid.clone();
    garbage.extend_from_slice(b"\xde\xad\xbe\xef trailing nonsense");
    assert_parity(&garbage, "trailing garbage");

    // Garbage *chunk* after the IDAT run (never read).
    let mut bad_tail = valid[..iend].to_vec();
    bad_tail.extend_from_slice(&[0, 0, 0, 4]); // length 4
    bad_tail.extend_from_slice(b"ZZZZ"); // unknown critical! still ignored
    bad_tail.extend_from_slice(&[1, 2, 3, 4, 0, 0, 0, 0]);
    assert_parity(&bad_tail, "unread critical chunk after IDAT");

    // Corrupt every CRC: both decoders run with CRC checking off.
    let mut bad_crcs = valid.clone();
    corrupt_all_crcs(&mut bad_crcs);
    assert_parity(&bad_crcs, "corrupt CRCs");

    // Missing adler32 trailer: spng stops at the last scanline byte.
    let stripped = strip_zlib_trailer(&valid);
    assert_parity(&stripped, "missing adler trailer");
}

/// Hand-built zlib streams: no BFINAL flag, FDICT set, bad header checksum.
#[test]
fn zlib_header_and_termination_quirks() {
    // 1x1 grayscale 8-bit: raw stream = [filter 0, sample]
    let scanlines = [0u8, 0x5A];

    // Stored block WITHOUT the final bit, no adler: spng accepts (it stops
    // once output is complete).
    let mut z = vec![0x78, 0x01];
    z.push(0); // BFINAL=0, stored
    z.extend_from_slice(&2u16.to_le_bytes());
    z.extend_from_slice(&(!2u16).to_le_bytes());
    z.extend_from_slice(&scanlines);
    assert_parity(&gray1x1_png(&z), "no BFINAL, no adler");

    // FDICT set: zlib demands a dictionary, spng errors.
    let mut zdict = vec![0x78, 0x20 | 0x01];
    // fix the %31 check
    let hdr = u16::from_be_bytes([zdict[0], zdict[1]]);
    zdict[1] += (31 - (hdr % 31) as u8) % 31;
    zdict.push(1);
    zdict.extend_from_slice(&2u16.to_le_bytes());
    zdict.extend_from_slice(&(!2u16).to_le_bytes());
    zdict.extend_from_slice(&scanlines);
    assert_parity(&gray1x1_png(&zdict), "FDICT set");

    // Bad zlib header checksum (CMF/FLG % 31 != 0).
    let mut zbad = vec![0x78, 0x02];
    zbad.push(1);
    zbad.extend_from_slice(&2u16.to_le_bytes());
    zbad.extend_from_slice(&(!2u16).to_le_bytes());
    zbad.extend_from_slice(&scanlines);
    assert_parity(&gray1x1_png(&zbad), "bad zlib header check");

    // Non-deflate compression method (CM != 8).
    let mut zcm = vec![0x79, 0x00];
    let hdr = u16::from_be_bytes([zcm[0], zcm[1]]);
    zcm[1] += (31 - (hdr % 31) as u8) % 31;
    zcm.push(1);
    zcm.extend_from_slice(&2u16.to_le_bytes());
    zcm.extend_from_slice(&(!2u16).to_le_bytes());
    zcm.extend_from_slice(&scanlines);
    assert_parity(&gray1x1_png(&zcm), "CM != 8");

    // Stream with data continuing past the needed output: spng ignores it.
    let mut zlong = vec![0x78, 0x01];
    zlong.push(0);
    zlong.extend_from_slice(&2u16.to_le_bytes());
    zlong.extend_from_slice(&(!2u16).to_le_bytes());
    zlong.extend_from_slice(&scanlines);
    zlong.push(0); // another stored block follows
    zlong.extend_from_slice(&5u16.to_le_bytes());
    zlong.extend_from_slice(&(!5u16).to_le_bytes());
    zlong.extend_from_slice(b"extra");
    assert_parity(&gray1x1_png(&zlong), "stream longer than needed");

    // Stream too short: ends (BFINAL+adler) before all scanlines.
    let mut zshort = vec![0x78, 0x01];
    zshort.push(1);
    zshort.extend_from_slice(&1u16.to_le_bytes());
    zshort.extend_from_slice(&(!1u16).to_le_bytes());
    zshort.push(0); // only the filter byte, no sample
    zshort.extend_from_slice(&[0, 0, 0, 1]); // adler placeholder
    assert_parity(&gray1x1_png(&zshort), "stream too short");
}

/// Chunk layout cases ported from fast_png_io plus spng's discard behavior.
#[test]
fn chunk_layout_parity() {
    let raw = lcg_bytes(4 * 3 * 3, 33);
    let valid = png_crate_encode(
        &raw,
        4,
        3,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        png::Filter::NoFilter,
        None,
        None,
    );

    // Duplicate IHDR: fatal for both.
    let ihdr = valid[8..33].to_vec();
    let mut dup = valid.clone();
    dup.splice(33..33, ihdr);
    assert_parity(&dup, "duplicate IHDR");

    // Chunk before IHDR.
    let ancillary = [0u8, 0, 0, 0, b'a', b'b', b'c', b'd', 0, 0, 0, 0];
    let mut leading = valid.clone();
    leading.splice(8..8, ancillary);
    assert_parity(&leading, "chunk before IHDR");

    // Unknown critical chunk pre-IDAT: fatal.
    let critical = [0u8, 0, 0, 0, b'A', b'b', b'c', b'd', 0, 0, 0, 0];
    let mut crit = valid.clone();
    crit.splice(33..33, critical);
    assert_parity(&crit, "unknown critical pre-IDAT");

    // Unknown ancillary chunk pre-IDAT: skipped by both.
    let mut anc = valid.clone();
    anc.splice(33..33, ancillary);
    assert_parity(&anc, "unknown ancillary pre-IDAT");

    // IEND before IDAT: fatal.
    let iend_chunk = {
        let p = find_chunk(&valid, b"IEND");
        valid[p..p + 12].to_vec()
    };
    let mut early_iend = valid.clone();
    early_iend.splice(33..33, iend_chunk);
    assert_parity(&early_iend, "IEND before IDAT");

    // Ancillary standard chunks with wrong sizes: discarded, image decodes.
    for (ty, len) in [(b"gAMA", 3usize), (b"cHRM", 31), (b"pHYs", 8), (b"tIME", 6)] {
        let mut chunk = (len as u32).to_be_bytes().to_vec();
        chunk.extend_from_slice(ty);
        chunk.extend_from_slice(&vec![1u8; len]);
        chunk.extend_from_slice(&[0; 4]);
        let mut spliced = valid.clone();
        spliced.splice(33..33, chunk);
        assert_parity(
            &spliced,
            &format!("undersized {}", String::from_utf8_lossy(ty)),
        );
    }

    // Valid gAMA + duplicate gAMA: duplicate discarded.
    let gama: Vec<u8> = {
        let mut c = 4u32.to_be_bytes().to_vec();
        c.extend_from_slice(b"gAMA");
        c.extend_from_slice(&45455u32.to_be_bytes());
        c.extend_from_slice(&[0; 4]);
        c
    };
    let mut dup_gama = valid.clone();
    dup_gama.splice(
        33..33,
        gama.iter().chain(gama.iter()).copied().collect::<Vec<u8>>(),
    );
    assert_parity(&dup_gama, "duplicate gAMA");

    // tEXt with valid and invalid keywords: accepted/discarded, decodes.
    for keyword in [&b"Comment"[..], &b" lead"[..], &b""[..]] {
        let mut payload = keyword.to_vec();
        payload.push(0);
        payload.extend_from_slice(b"hello");
        let mut chunk = (payload.len() as u32).to_be_bytes().to_vec();
        chunk.extend_from_slice(b"tEXt");
        chunk.extend_from_slice(&payload);
        chunk.extend_from_slice(&[0; 4]);
        let mut spliced = valid.clone();
        spliced.splice(33..33, chunk);
        assert_parity(&spliced, &format!("tEXt keyword {:?}", keyword));
    }
}

/// tRNS/PLTE ordering interactions, including spng's flag-state subtleties.
#[test]
fn plte_trns_ordering_parity() {
    let plte = lcg_bytes(8 * 3, 35);
    let trns = lcg_bytes(4, 37);
    let mut indices = lcg_bytes(9, 39);
    for i in &mut indices {
        *i %= 8;
    }
    let valid = png_crate_encode(
        &indices,
        3,
        3,
        png::ColorType::Indexed,
        png::BitDepth::Eight,
        png::Filter::NoFilter,
        Some(&plte),
        Some(&trns),
    );
    assert_parity(&valid, "indexed baseline");

    // tRNS after IDAT: spng never reads it (trailing chunks ignored).
    let trns_pos = find_chunk(&valid, b"tRNS");
    let trns_chunk = valid[trns_pos..trns_pos + 12 + 4].to_vec();
    let mut moved = valid.clone();
    moved.drain(trns_pos..trns_pos + 12 + 4);
    let iend = find_chunk(&moved, b"IEND");
    moved.splice(iend..iend, trns_chunk.clone());
    assert_parity(&moved, "tRNS after IDAT");

    // tRNS before PLTE (indexed): size error vs 0-entry palette, discarded.
    let plte_pos = find_chunk(&valid, b"PLTE");
    let mut swapped = valid.clone();
    swapped.drain(trns_pos..trns_pos + 12 + 4);
    swapped.splice(plte_pos..plte_pos, trns_chunk);
    assert_parity(&swapped, "tRNS before PLTE");

    // tRNS longer than palette: discarded (alpha 255), image decodes.
    let long_trns = lcg_bytes(9, 41);
    let mut long = valid.clone();
    let tp = find_chunk(&long, b"tRNS");
    let old_len = u32::from_be_bytes(long[tp..tp + 4].try_into().unwrap()) as usize;
    long.splice(tp..tp + 12 + old_len, {
        let mut c = (long_trns.len() as u32).to_be_bytes().to_vec();
        c.extend_from_slice(b"tRNS");
        c.extend_from_slice(&long_trns);
        c.extend_from_slice(&[0; 4]);
        c
    });
    assert_parity(&long, "tRNS longer than palette");

    // Duplicate PLTE: spng has no dup check; last wins.
    let plte2 = lcg_bytes(8 * 3, 43);
    let mut dup_plte = valid.clone();
    let pp = find_chunk(&dup_plte, b"PLTE");
    let plen = u32::from_be_bytes(dup_plte[pp..pp + 4].try_into().unwrap()) as usize;
    let insert_at = pp + 12 + plen;
    let mut chunk = (plte2.len() as u32).to_be_bytes().to_vec();
    chunk.extend_from_slice(b"PLTE");
    chunk.extend_from_slice(&plte2);
    chunk.extend_from_slice(&[0; 4]);
    // Second PLTE must come before tRNS (PLTE-after-tRNS is fatal — also
    // covered below).
    dup_plte.splice(insert_at..insert_at, chunk.clone());
    assert_parity(&dup_plte, "duplicate PLTE, last wins");

    // PLTE after tRNS: fatal ChunkPos for both.
    let mut plte_after_trns = valid.clone();
    let tp = find_chunk(&plte_after_trns, b"tRNS");
    let tlen = u32::from_be_bytes(plte_after_trns[tp..tp + 4].try_into().unwrap()) as usize;
    let after_trns = tp + 12 + tlen;
    plte_after_trns.splice(after_trns..after_trns, chunk);
    assert_parity(&plte_after_trns, "PLTE after tRNS");

    // Indexed without PLTE at IDAT: fatal NoPlte.
    let mut no_plte = valid.clone();
    let pp = find_chunk(&no_plte, b"PLTE");
    let plen = u32::from_be_bytes(no_plte[pp..pp + 4].try_into().unwrap()) as usize;
    no_plte.drain(pp..pp + 12 + plen);
    assert_parity(&no_plte, "indexed without PLTE");
}

/// IDAT run handling: split chunks, zero-length chunks, interrupted runs,
/// extra IDATs after the stream completes.
#[test]
fn idat_run_parity() {
    let raw = lcg_bytes(16 * 4 * 3, 51);
    let valid = png_crate_encode(
        &raw,
        16,
        4,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        png::Filter::Sub,
        None,
        None,
    );

    let idat = find_chunk(&valid, b"IDAT");
    let idat_len = u32::from_be_bytes(valid[idat..idat + 4].try_into().unwrap()) as usize;
    let payload = valid[idat + 8..idat + 8 + idat_len].to_vec();
    let tail = valid[idat + 8 + idat_len + 4..].to_vec();

    // Rebuild with the payload split across chunks, optionally with an
    // interloper chunk inside the run.
    let rebuild = |splits: &[usize], interloper: Option<&[u8]>| -> Vec<u8> {
        let mut out = valid[..idat].to_vec();
        let mut prev = 0;
        for (i, &split) in splits
            .iter()
            .chain(std::iter::once(&payload.len()))
            .enumerate()
        {
            if i == 1 {
                if let Some(chunk) = interloper {
                    out.extend_from_slice(chunk);
                }
            }
            let part = &payload[prev..split];
            out.extend_from_slice(&(part.len() as u32).to_be_bytes());
            out.extend_from_slice(b"IDAT");
            out.extend_from_slice(part);
            out.extend_from_slice(&[0; 4]);
            prev = split;
        }
        out.extend_from_slice(&tail);
        out
    };

    assert_parity(&rebuild(&[1], None), "IDAT split at 1");
    assert_parity(&rebuild(&[1, 2, 3], None), "IDAT split tiny");
    assert_parity(&rebuild(&[payload.len() / 2], None), "IDAT split half");

    // Zero-length IDAT chunks inside the run are fine.
    let with_empty = {
        let mut out = valid[..idat].to_vec();
        out.extend_from_slice(&[0, 0, 0, 0]);
        out.extend_from_slice(b"IDAT");
        out.extend_from_slice(&[0; 4]);
        out.extend_from_slice(&valid[idat..]);
        out
    };
    assert_parity(&with_empty, "leading zero-length IDAT");

    // Ancillary chunk interrupting the run: stream incomplete at that point
    // -> EIDAT_TOO_SHORT for both.
    let anc = [0u8, 0, 0, 0, b'a', b'b', b'c', b'd', 0, 0, 0, 0];
    assert_parity(&rebuild(&[1], Some(&anc)), "IDAT run interrupted");

    // Extra IDAT after the complete stream, contiguous: ignored by spng
    // (never read).
    let mut extra = valid[..idat + 8 + idat_len + 4].to_vec();
    extra.extend_from_slice(&[0, 0, 0, 2]);
    extra.extend_from_slice(b"IDAT");
    extra.extend_from_slice(&[0xFF, 0xFF, 0, 0, 0, 0]);
    extra.extend_from_slice(&tail);
    assert_parity(&extra, "extra IDAT after stream end");

    // Truncations at every offset of a small file.
    let small = png_crate_encode(
        &lcg_bytes(3 * 2 * 3, 53),
        3,
        2,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        png::Filter::NoFilter,
        None,
        None,
    );
    for cut in 0..small.len() {
        assert_parity(&small[..cut], &format!("truncated at {cut}"));
    }
}

/// Chunk count and cache limits: > 1000 counted chunks and zTXt zip bombs
/// are fatal for both decoders.
#[test]
fn limits_parity() {
    let raw = lcg_bytes(2 * 2 * 3, 61);
    let valid = png_crate_encode(
        &raw,
        2,
        2,
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        png::Filter::NoFilter,
        None,
        None,
    );

    // 1001 tEXt chunks: chunk count limit.
    let text_chunk: Vec<u8> = {
        let payload = b"k\0v";
        let mut c = (payload.len() as u32).to_be_bytes().to_vec();
        c.extend_from_slice(b"tEXt");
        c.extend_from_slice(payload);
        c.extend_from_slice(&[0; 4]);
        c
    };
    for (count, label) in [(999usize, "999 tEXt chunks"), (1001, "1001 tEXt chunks")] {
        let mut many = valid[..33].to_vec();
        for _ in 0..count {
            many.extend_from_slice(&text_chunk);
        }
        many.extend_from_slice(&valid[33..]);
        assert_parity(&many, label);
    }

    // zTXt inflating past the 64 MB cache limit: fatal.
    let bomb = {
        let huge = vec![0u8; 70 * 1024 * 1024];
        let mut c = libdeflater::Compressor::new(libdeflater::CompressionLvl::default());
        let mut z = vec![0u8; c.zlib_compress_bound(huge.len())];
        let n = c.zlib_compress(&huge, &mut z).unwrap();
        z.truncate(n);
        z
    };
    let mut payload = b"k\0\0".to_vec();
    payload.extend_from_slice(&bomb);
    let mut chunk = (payload.len() as u32).to_be_bytes().to_vec();
    chunk.extend_from_slice(b"zTXt");
    chunk.extend_from_slice(&payload);
    chunk.extend_from_slice(&[0; 4]);
    let mut bombed = valid[..33].to_vec();
    bombed.extend_from_slice(&chunk);
    bombed.extend_from_slice(&valid[33..]);
    assert_parity(&bombed, "zTXt zip bomb");
}

/// Deterministic single-byte corruptions across a varied file (palette +
/// tRNS + gAMA + text): every mutation must keep the two decoders agreeing.
#[test]
fn corruption_sweep_parity() {
    let plte = lcg_bytes(16 * 3, 71);
    let trns = lcg_bytes(8, 73);
    let mut indices = lcg_bytes(8 * 8, 75);
    for i in &mut indices {
        *i %= 16;
    }
    let mut valid = png_crate_encode(
        &indices,
        8,
        8,
        png::ColorType::Indexed,
        png::BitDepth::Eight,
        png::Filter::Adaptive,
        Some(&plte),
        Some(&trns),
    );
    // Add a tEXt chunk for surface.
    let text = {
        let payload = b"Comment\0corruption sweep";
        let mut c = (payload.len() as u32).to_be_bytes().to_vec();
        c.extend_from_slice(b"tEXt");
        c.extend_from_slice(payload);
        c.extend_from_slice(&[0; 4]);
        c
    };
    valid.splice(33..33, text);
    assert_parity(&valid, "sweep baseline");

    let mut seed = 0xdead_beefu32;
    for _ in 0..2000 {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let pos = (seed as usize) % valid.len();
        let mut corrupted = valid.clone();
        corrupted[pos] ^= ((seed >> 16) as u8).max(1);
        assert_parity(
            &corrupted,
            &format!("byte {pos} ^ {:#x}", (seed >> 16) as u8),
        );
    }
}

/// Found by fuzz_decode_differential: the zlib stream produced every needed
/// scanline byte, but invalid deflate data sat right after them *within the
/// same IDAT chunk*. zlib parses ahead through the current input until it
/// would need to write another output byte, so spng rejects — the early
/// "output complete" return must not shadow the lookahead error.
#[test]
fn lookahead_error_after_complete_output_is_rejected() {
    let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    png.extend_from_slice(&[0, 0, 0, 13]);
    png.extend_from_slice(b"IHDR");
    png.extend_from_slice(&1u32.to_be_bytes());
    png.extend_from_slice(&1u32.to_be_bytes());
    png.extend_from_slice(&[8, 0, 0, 0, 0]);
    png.extend_from_slice(&[0x3a, 0x7e, 0x9b, 0x55]);
    // 2 valid output bytes, then garbage deflate data in the same chunk.
    let idat = [0x78, 0x9c, 0x63, 0xb0, 0x05, 0xff, 0xff, 0xff, 0xff, 0xff];
    png.extend_from_slice(&(idat.len() as u32).to_be_bytes());
    png.extend_from_slice(b"IDAT");
    png.extend_from_slice(&idat);
    png.extend_from_slice(&[0xff; 4]); // CRC (unchecked)
    assert_parity(&png, "lookahead error after complete output");
    assert!(decode(&png).is_err(), "must reject like zlib's parse-ahead");
}

/// Found by fuzz_decode_differential (round 2, opposite direction): the
/// stream produces every scanline byte, then an invalid construct sits
/// exactly past the final output byte — *after* zlib's output-space gate.
/// zlib never reaches its validity check there, so spng ACCEPTS; the inflate
/// path must stop at the write gate exactly like zlib (this is why the
/// exact path is zlib-rs, not an emulation).
#[test]
fn lookahead_stops_at_write_gate_like_zlib() {
    let mut png = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    png.extend_from_slice(&[0, 0, 0, 13]);
    png.extend_from_slice(b"IHDR");
    png.extend_from_slice(&3u32.to_be_bytes());
    png.extend_from_slice(&3u32.to_be_bytes());
    png.extend_from_slice(&[1, 3, 0, 0, 0]); // 1-bit indexed
    png.extend_from_slice(&[0; 4]);
    png.extend_from_slice(&[0, 0, 0, 6]);
    png.extend_from_slice(b"PLTE");
    png.extend_from_slice(&[0, 255, 0, 255, 0x77, 0]);
    png.extend_from_slice(&[0; 4]);
    let idat = [
        0x78, 0x9c, 0x63, 0x60, 0x61, 0x70, 0x60, 0x60, 0x22, 0x22, 0x39, 0x31, 0x0c, 0x4b,
    ];
    png.extend_from_slice(&(idat.len() as u32).to_be_bytes());
    png.extend_from_slice(b"IDAT");
    png.extend_from_slice(&idat);
    // No CRC, no IEND: spng never reads past the consumed IDAT payload.
    assert_parity(&png, "lookahead stops at write gate");
    assert!(
        decode(&png).is_ok(),
        "must accept like zlib's write-gated lookahead"
    );
}

/// Found by fuzz_decode_differential (round 3): classic zlib's "invalid
/// distance too far back" verdict depends on the avail_out gating — this
/// stream passes with spng's per-scanline windows but fails with one big
/// output buffer (and zlib-ng/zlib-rs reject it under any gating). The
/// exact inflate path must link the same zlib as spng AND replicate its
/// per-scanline gate sequence.
#[test]
fn gated_too_far_distance_matches_spng() {
    let bytes = std::fs::read(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/gated-too-far-distance.png"),
    )
    .unwrap();
    assert_parity(&bytes, "gated too-far distance");
    assert!(
        decode(&bytes).is_ok(),
        "spng accepts this under scanline gating"
    );
}

/// Found by fuzz_decode_differential (round 5, pixel mismatch): spng's
/// palette is a fixed 256-entry array that PLTE chunks overwrite in place.
/// A second, *shorter* PLTE lowers n_entries but leaves the first palette's
/// colors in the tail, and the decode LUT reads all 256 entries — so
/// out-of-range indices resolve to the leftover colors, not opaque black.
#[test]
fn duplicate_plte_leftover_entries_match_spng() {
    let mut indices = lcg_bytes(32 * 32, 77);
    for i in &mut indices {
        *i %= 4; // touch entries 0..3; entries 1..3 come from PLTE #1
    }
    let raw = pack_rows(&indices, 32, 32, 2);
    let valid = png_crate_encode(
        &raw,
        32,
        32,
        png::ColorType::Indexed,
        png::BitDepth::Two,
        png::Filter::NoFilter,
        Some(&[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
        None,
    );
    // Insert a 1-entry PLTE after the original 4-entry one.
    let plte = find_chunk(&valid, b"PLTE");
    let plen = u32::from_be_bytes(valid[plte..plte + 4].try_into().unwrap()) as usize;
    let mut chunk = 3u32.to_be_bytes().to_vec();
    chunk.extend_from_slice(b"PLTE");
    chunk.extend_from_slice(&[0, 0x55, 0xAA]);
    chunk.extend_from_slice(&[0; 4]);
    let at = plte + 12 + plen;
    let mut dup = valid.clone();
    dup.splice(at..at, chunk);
    assert_parity(&dup, "shorter duplicate PLTE keeps leftover tail entries");
}

/// Real VRT fixtures: every checked-in screenshot must decode byte-identically
/// to spng. Skipped when the repo's `fixtures/` tree isn't present (e.g. an
/// isolated crate package build).
#[test]
fn vrt_fixtures_parity_with_spng() {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    if !root.exists() {
        return;
    }
    let mut checked = 0usize;
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "png") {
                let bytes = std::fs::read(&path).unwrap();
                assert_parity(&bytes, &path.display().to_string());
                checked += 1;
            }
        }
    }
    assert!(checked > 0, "expected to find fixture PNGs under {root:?}");
}

fn find_chunk(bytes: &[u8], ty: &[u8; 4]) -> usize {
    let mut pos = 8;
    loop {
        let len = u32::from_be_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        if &bytes[pos + 4..pos + 8] == ty {
            return pos;
        }
        pos += 12 + len;
    }
}

fn corrupt_all_crcs(bytes: &mut [u8]) {
    let mut pos = 8;
    while pos + 8 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        let crc = pos + 8 + len;
        if crc + 4 > bytes.len() {
            break;
        }
        bytes[crc] ^= 0xFF;
        bytes[crc + 3] ^= 0x55;
        pos = crc + 4;
    }
}

/// Rewrite the (single) IDAT chunk with its zlib adler32 trailer removed.
fn strip_zlib_trailer(bytes: &[u8]) -> Vec<u8> {
    let idat = find_chunk(bytes, b"IDAT");
    let len = u32::from_be_bytes(bytes[idat..idat + 4].try_into().unwrap()) as usize;
    let payload = &bytes[idat + 8..idat + 8 + len];
    let stripped = &payload[..payload.len() - 4];
    let mut out = bytes[..idat].to_vec();
    out.extend_from_slice(&(stripped.len() as u32).to_be_bytes());
    out.extend_from_slice(b"IDAT");
    out.extend_from_slice(stripped);
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&bytes[idat + 8 + len + 4..]);
    out
}

fn gray1x1_png(zlib: &[u8]) -> Vec<u8> {
    let mut out = vec![0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    let mut ihdr = vec![0, 0, 0, 13];
    ihdr.extend_from_slice(b"IHDR");
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&1u32.to_be_bytes());
    ihdr.extend_from_slice(&[8, 0, 0, 0, 0]); // depth 8, gray
    ihdr.extend_from_slice(&[0; 4]); // CRC unchecked
    out.extend_from_slice(&ihdr);
    out.extend_from_slice(&(zlib.len() as u32).to_be_bytes());
    out.extend_from_slice(b"IDAT");
    out.extend_from_slice(zlib);
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(b"IEND");
    out.extend_from_slice(&[0; 4]);
    out
}
