//! Differential metadata parity: reconstruct `blazediff_png::Metadata` from
//! libspng's `spng_get_*` getters and assert it equals what
//! `decode_with_metadata` captured — field for field, for every chunk type.
//!
//! Run over (a) PNGs we author with a full complement of chunks and (b) the
//! PngSuite corpus. spng is driven with `SPNG_KEEP_UNKNOWN_CHUNKS` so even
//! unknown-chunk passthrough is compared.

use std::path::Path;

use blazediff_png::{
    decode_with_metadata, encode_with_metadata, Bkgd, Chrm, ColorMode, EncodeOptions, Iccp, Image,
    Location, Metadata, Offs, Palette, Phys, Sbit, Splt, SpltEntry, Text, TextKind, Time, Trns,
    UnknownChunk,
};

use blazediff::spng_ffi::*;

struct CtxGuard(*mut spng_ctx);
impl Drop for CtxGuard {
    fn drop(&mut self) {
        unsafe { spng_ctx_free(self.0) }
    }
}

fn cstr(buf: &[std::os::raw::c_char]) -> Vec<u8> {
    buf.iter()
        .take_while(|&&b| b != 0)
        .map(|&b| b as u8)
        .collect()
}

/// Reconstruct our metadata model from spng's getters for `png`.
fn spng_meta(png: &[u8]) -> Metadata {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_IGNORE_ADLER32 as i32);
        assert!(!ctx.is_null());
        let _g = CtxGuard(ctx);
        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as i32,
            spng_crc_action_SPNG_CRC_USE as i32,
        );
        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);
        spng_set_option(ctx, spng_option_SPNG_KEEP_UNKNOWN_CHUNKS, 1);
        assert_eq!(
            spng_set_png_buffer(ctx, png.as_ptr() as *const _, png.len()),
            0
        );

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        assert_eq!(spng_get_ihdr(ctx, &mut ihdr), 0);
        let color_type = ihdr.color_type;

        // Fully decode the image so spng consumes the IDAT stream and reads
        // the chunks trailing it (spng_decode_chunks alone stops at IDAT).
        let mut out_size: usize = 0;
        assert_eq!(
            spng_decoded_image_size(ctx, spng_format_SPNG_FMT_RGBA8 as i32, &mut out_size),
            0
        );
        let mut buf: Vec<u8> = vec![0u8; out_size];
        assert_eq!(
            spng_decode_image(
                ctx,
                buf.as_mut_ptr() as *mut _,
                out_size,
                spng_format_SPNG_FMT_RGBA8 as i32,
                spng_decode_flags_SPNG_DECODE_TRNS as i32,
            ),
            0,
            "spng_decode_image failed"
        );

        let mut m = Metadata::default();

        let mut plte: spng_plte = std::mem::zeroed();
        if spng_get_plte(ctx, &mut plte) == 0 {
            let n = plte.n_entries as usize;
            m.palette = Some(Palette {
                entries: plte.entries[..n]
                    .iter()
                    .map(|e| [e.red, e.green, e.blue])
                    .collect(),
            });
        }

        let mut trns: spng_trns = std::mem::zeroed();
        if spng_get_trns(ctx, &mut trns) == 0 {
            m.transparency = Some(match color_type {
                0 => Trns::Gray(trns.gray),
                2 => Trns::Rgb(trns.red, trns.green, trns.blue),
                _ => Trns::Palette(trns.type3_alpha[..trns.n_type3_entries as usize].to_vec()),
            });
        }

        let mut chrm: spng_chrm_int = std::mem::zeroed();
        if spng_get_chrm_int(ctx, &mut chrm) == 0 {
            m.chrm = Some(Chrm {
                white_x: chrm.white_point_x,
                white_y: chrm.white_point_y,
                red_x: chrm.red_x,
                red_y: chrm.red_y,
                green_x: chrm.green_x,
                green_y: chrm.green_y,
                blue_x: chrm.blue_x,
                blue_y: chrm.blue_y,
            });
        }

        let mut gama: u32 = 0;
        if spng_get_gama_int(ctx, &mut gama) == 0 {
            m.gama = Some(gama);
        }

        let mut iccp: spng_iccp = std::mem::zeroed();
        if spng_get_iccp(ctx, &mut iccp) == 0 {
            let profile =
                std::slice::from_raw_parts(iccp.profile as *const u8, iccp.profile_len).to_vec();
            m.iccp = Some(Iccp {
                name: cstr(&iccp.profile_name),
                profile,
            });
        }

        let mut sbit: spng_sbit = std::mem::zeroed();
        if spng_get_sbit(ctx, &mut sbit) == 0 {
            m.sbit = Some(Sbit {
                grayscale: sbit.grayscale_bits,
                red: sbit.red_bits,
                green: sbit.green_bits,
                blue: sbit.blue_bits,
                alpha: sbit.alpha_bits,
            });
        }

        let mut srgb: u8 = 0;
        if spng_get_srgb(ctx, &mut srgb) == 0 {
            m.srgb = Some(srgb);
        }

        let mut n_text: u32 = 0;
        if spng_get_text(ctx, std::ptr::null_mut(), &mut n_text) == 0 && n_text > 0 {
            let mut texts: Vec<spng_text> = vec![std::mem::zeroed(); n_text as usize];
            assert_eq!(spng_get_text(ctx, texts.as_mut_ptr(), &mut n_text), 0);
            for t in &texts {
                let kind = match t.type_ as u32 {
                    x if x == spng_text_type_SPNG_TEXT => TextKind::Text,
                    x if x == spng_text_type_SPNG_ZTXT => TextKind::Ztxt,
                    _ => TextKind::Itxt,
                };
                let text = std::slice::from_raw_parts(t.text as *const u8, t.length).to_vec();
                let (lang, translated) = if kind == TextKind::Itxt {
                    (cstr_ptr(t.language_tag), cstr_ptr(t.translated_keyword))
                } else {
                    (vec![], vec![])
                };
                m.text.push(Text {
                    kind,
                    keyword: cstr(&t.keyword),
                    text,
                    compressed: match kind {
                        TextKind::Text => false,
                        TextKind::Ztxt => true,
                        TextKind::Itxt => t.compression_flag == 1,
                    },
                    language_tag: lang,
                    translated_keyword: translated,
                });
            }
        }

        let mut bkgd: spng_bkgd = std::mem::zeroed();
        if spng_get_bkgd(ctx, &mut bkgd) == 0 {
            m.bkgd = Some(match color_type {
                0 | 4 => Bkgd::Gray(bkgd.gray),
                2 | 6 => Bkgd::Rgb(bkgd.red, bkgd.green, bkgd.blue),
                _ => Bkgd::Palette(bkgd.plte_index as u8),
            });
        }

        let mut hist: spng_hist = std::mem::zeroed();
        if spng_get_hist(ctx, &mut hist) == 0 {
            let n = m.palette.as_ref().map_or(0, |p| p.entries.len());
            m.hist = Some(hist.frequency[..n].to_vec());
        }

        let mut phys: spng_phys = std::mem::zeroed();
        if spng_get_phys(ctx, &mut phys) == 0 {
            m.phys = Some(Phys {
                ppu_x: phys.ppu_x,
                ppu_y: phys.ppu_y,
                unit: phys.unit_specifier,
            });
        }

        let mut n_splt: u32 = 0;
        if spng_get_splt(ctx, std::ptr::null_mut(), &mut n_splt) == 0 && n_splt > 0 {
            let mut splts: Vec<spng_splt> = vec![std::mem::zeroed(); n_splt as usize];
            assert_eq!(spng_get_splt(ctx, splts.as_mut_ptr(), &mut n_splt), 0);
            for s in &splts {
                let entries = std::slice::from_raw_parts(s.entries, s.n_entries as usize)
                    .iter()
                    .map(|e| SpltEntry {
                        red: e.red,
                        green: e.green,
                        blue: e.blue,
                        alpha: e.alpha,
                        frequency: e.frequency,
                    })
                    .collect();
                m.splt.push(Splt {
                    name: cstr(&s.name),
                    sample_depth: s.sample_depth,
                    entries,
                });
            }
        }

        let mut time: spng_time = std::mem::zeroed();
        if spng_get_time(ctx, &mut time) == 0 {
            m.time = Some(Time {
                year: time.year,
                month: time.month,
                day: time.day,
                hour: time.hour,
                minute: time.minute,
                second: time.second,
            });
        }

        let mut offs: spng_offs = std::mem::zeroed();
        if spng_get_offs(ctx, &mut offs) == 0 {
            m.offs = Some(Offs {
                x: offs.x,
                y: offs.y,
                unit: offs.unit_specifier,
            });
        }

        let mut exif: spng_exif = std::mem::zeroed();
        if spng_get_exif(ctx, &mut exif) == 0 {
            m.exif = Some(std::slice::from_raw_parts(exif.data as *const u8, exif.length).to_vec());
        }

        // NOTE: libspng's spng_get_unknown_chunks copies only
        // `sizeof(struct spng_unknown_chunk)` — i.e. a single chunk —
        // regardless of count, so its getter materializes only the *first*
        // unknown chunk. We compare that one here; full multi-chunk
        // passthrough fidelity is covered by the round-trip test.
        let mut n_unknown: u32 = 0;
        if spng_get_unknown_chunks(ctx, std::ptr::null_mut(), &mut n_unknown) == 0 && n_unknown > 0
        {
            let mut chunks: Vec<spng_unknown_chunk> = vec![std::mem::zeroed(); n_unknown as usize];
            assert_eq!(
                spng_get_unknown_chunks(ctx, chunks.as_mut_ptr(), &mut n_unknown),
                0
            );
            let c = &chunks[0];
            let location = match c.location {
                x if x == spng_location_SPNG_AFTER_IHDR => Location::AfterIhdr,
                x if x == spng_location_SPNG_AFTER_PLTE => Location::AfterPlte,
                _ => Location::AfterIdat,
            };
            let data = std::slice::from_raw_parts(c.data as *const u8, c.length).to_vec();
            m.unknown.push(UnknownChunk {
                kind: c.type_,
                data,
                location,
            });
        }

        m
    }
}

unsafe fn cstr_ptr(p: *mut std::os::raw::c_char) -> Vec<u8> {
    if p.is_null() {
        return vec![];
    }
    let mut out = Vec::new();
    let mut i = 0;
    loop {
        let b = *p.add(i) as u8;
        if b == 0 {
            break;
        }
        out.push(b);
        i += 1;
    }
    out
}

fn assert_parity(png: &[u8], label: &str) {
    let ours = decode_with_metadata(png)
        .unwrap_or_else(|e| panic!("{label}: our decode failed: {e:?}"))
        .meta;
    let theirs = spng_meta(png);
    // spng's getter only returns the first unknown chunk (see spng_meta); cap
    // ours to match. Multi-unknown fidelity is covered by the round-trip test.
    let mut ours = ours;
    ours.unknown.truncate(theirs.unknown.len());
    assert_eq!(ours, theirs, "{label}: metadata parity with spng");
}

#[test]
fn parity_on_authored_rich_metadata() {
    // Truecolor-alpha with the full non-indexed chunk set.
    let img = Image {
        data: (0..16)
            .flat_map(|i: u32| [i as u8 * 7, 30, 60, 255])
            .collect(),
        width: 4,
        height: 4,
    };
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
        srgb: Some(1),
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
                text: b"zzzzzzzzzzzzzzzzzzzz compressed".to_vec(),
                compressed: true,
                language_tag: vec![],
                translated_keyword: vec![],
            },
            Text {
                kind: TextKind::Itxt,
                keyword: b"Author".to_vec(),
                text: "unicode \u{2603}".as_bytes().to_vec(),
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
            name: b"sugg".to_vec(),
            sample_depth: 16,
            entries: vec![SpltEntry {
                red: 1000,
                green: 2000,
                blue: 3000,
                alpha: 65535,
                frequency: 7,
            }],
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
    assert_parity(&png, "rich-truecolor-alpha");
}

#[test]
fn parity_on_authored_indexed_metadata() {
    let colors = [[10u8, 20, 30], [200, 100, 50], [0, 0, 0]];
    let data: Vec<u8> = (0..16u32)
        .flat_map(|i| {
            let c = colors[(i % 2) as usize];
            let a = if i % 2 == 0 { 128 } else { 255 };
            [c[0], c[1], c[2], a]
        })
        .collect();
    let img = Image {
        data,
        width: 4,
        height: 4,
    };
    let meta = Metadata {
        palette: Some(Palette {
            entries: colors.to_vec(),
        }),
        transparency: Some(Trns::Palette(vec![128])),
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
    assert_parity(&png, "rich-indexed");
}

#[test]
fn parity_on_pngsuite_corpus() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/pngsuite");
    let mut count = 0;
    for entry in std::fs::read_dir(&dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("png") {
            continue;
        }
        let bytes = std::fs::read(&path).unwrap();
        // Only compare where both decoders accept the file.
        if decode_with_metadata(&bytes).is_err() {
            continue;
        }
        assert_parity(&bytes, path.file_name().unwrap().to_str().unwrap());
        count += 1;
    }
    assert!(count > 0, "no pngsuite files exercised");
}
