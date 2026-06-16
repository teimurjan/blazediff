//! Shared helpers for the blazediff_png fuzz targets.

/// Mirrors `-max_len` so artifact replay without libFuzzer flags stays safe.
pub const MAX_INPUT_LEN: usize = 4 * 1024 * 1024;

/// Max W*H any IHDR may declare: 4M px = 16 MB RGBA per decode. 1-bpp and
/// 16-bit formats balloon output far past the raw-stream cap, so the guard
/// is essential to keep OOM noise out of the runs.
pub const MAX_PIXELS: u64 = 4_000_000;

const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];

/// Per-exec setup hook. The codec is single-threaded, so there is nothing to
/// pin anymore; retained as a no-op so the fuzz targets keep a stable
/// call site.
pub fn init() {}

/// Walk chunks leniently (stop at IEND, bail on truncation) and reject if
/// any IHDR would commit decode() to more than MAX_PIXELS pixels. Returns
/// true for non-PNG or truncated data because decode() rejects those
/// cheaply itself.
pub fn dims_within_budget(data: &[u8]) -> bool {
    if data.len() < 8 || data[..8] != PNG_SIG {
        return true;
    }
    let mut pos = 8usize;
    while pos + 8 <= data.len() {
        let len = u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        let ty = &data[pos + 4..pos + 8];
        // Check dimensions BEFORE the truncation bail: the spng oracle
        // allocates width * 4 * height from the IHDR alone, even for files
        // truncated mid-payload (found as a 339 GB malloc OOM).
        if ty == b"IHDR" && len == 13 && pos + 16 <= data.len() {
            let w = u32::from_be_bytes(data[pos + 8..pos + 12].try_into().unwrap()) as u64;
            let h = u32::from_be_bytes(data[pos + 12..pos + 16].try_into().unwrap()) as u64;
            if w * h > MAX_PIXELS {
                return false;
            }
        }
        let payload_end = pos + 8 + len;
        if payload_end + 4 > data.len() {
            return true;
        }
        if ty == b"IEND" {
            break;
        }
        pos = payload_end + 4; // skip crc
    }
    true
}

/// Reconstruct `blazediff_png::Metadata` from libspng's `spng_get_*` getters,
/// or `None` if spng cannot fully decode the image (so the differential target
/// only compares when both decoders accept). Robust by design: every spng call
/// is checked, never asserted.
///
/// libspng's `spng_get_unknown_chunks` only materializes the first stored
/// chunk (it `memcpy`s one struct regardless of count), so only the first
/// unknown chunk is reconstructed; the differential target caps our list to
/// match. Full multi-chunk passthrough is covered by the round-trip test.
pub fn spng_metadata(png: &[u8]) -> Option<blazediff_png::Metadata> {
    use blazediff::spng_ffi::*;
    use blazediff_png::*;

    struct Guard(*mut spng_ctx);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe { spng_ctx_free(self.0) }
        }
    }
    unsafe fn cstr(buf: &[std::os::raw::c_char]) -> Vec<u8> {
        buf.iter().take_while(|&&b| b != 0).map(|&b| b as u8).collect()
    }
    unsafe fn cstr_ptr(p: *mut std::os::raw::c_char) -> Vec<u8> {
        if p.is_null() {
            return vec![];
        }
        let mut out = Vec::new();
        let mut i = 0;
        while *p.add(i) != 0 {
            out.push(*p.add(i) as u8);
            i += 1;
        }
        out
    }
    // from_raw_parts rejects null even for len 0; spng can return either.
    unsafe fn raw(ptr: *const u8, len: usize) -> Vec<u8> {
        if ptr.is_null() || len == 0 {
            vec![]
        } else {
            std::slice::from_raw_parts(ptr, len).to_vec()
        }
    }

    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_IGNORE_ADLER32 as i32);
        if ctx.is_null() {
            return None;
        }
        let _g = Guard(ctx);
        spng_set_crc_action(
            ctx,
            spng_crc_action_SPNG_CRC_USE as i32,
            spng_crc_action_SPNG_CRC_USE as i32,
        );
        spng_set_chunk_limits(ctx, 64 * 1024 * 1024, 64 * 1024 * 1024);
        spng_set_option(ctx, spng_option_SPNG_KEEP_UNKNOWN_CHUNKS, 1);
        if spng_set_png_buffer(ctx, png.as_ptr() as *const _, png.len()) != 0 {
            return None;
        }

        let mut ihdr: spng_ihdr = std::mem::zeroed();
        if spng_get_ihdr(ctx, &mut ihdr) != 0 {
            return None;
        }
        let color_type = ihdr.color_type;

        let mut out_size: usize = 0;
        if spng_decoded_image_size(ctx, spng_format_SPNG_FMT_RGBA8 as i32, &mut out_size) != 0 {
            return None;
        }
        let mut buf: Vec<u8> = vec![0u8; out_size];
        if spng_decode_image(
            ctx,
            buf.as_mut_ptr() as *mut _,
            out_size,
            spng_format_SPNG_FMT_RGBA8 as i32,
            spng_decode_flags_SPNG_DECODE_TRNS as i32,
        ) != 0
        {
            return None;
        }

        // spng's getter boilerplate re-runs read_chunks, so a single
        // malformed chunk *trailing* the IDAT run makes every getter return
        // that read error — even for chunks validly present before IDAT.
        // Distinguish "cleanly absent" (ECHUNKAVAIL) from "reader poisoned"
        // (any other error): on the latter, skip the whole comparison, since
        // spng simply refuses to enumerate metadata it nonetheless decoded
        // with. `?` propagates the skip as `None`.
        let chk = |ret: i32| -> Option<bool> {
            if ret == 0 {
                Some(true)
            } else if ret == spng_errno_SPNG_ECHUNKAVAIL as i32 {
                Some(false)
            } else {
                None
            }
        };

        let mut m = Metadata::default();

        let mut plte: spng_plte = std::mem::zeroed();
        if chk(spng_get_plte(ctx, &mut plte))? {
            let n = plte.n_entries as usize;
            m.palette = Some(Palette {
                entries: plte.entries[..n].iter().map(|e| [e.red, e.green, e.blue]).collect(),
            });
        }
        let mut trns: spng_trns = std::mem::zeroed();
        if chk(spng_get_trns(ctx, &mut trns))? {
            m.transparency = Some(match color_type {
                0 => Trns::Gray(trns.gray),
                2 => Trns::Rgb(trns.red, trns.green, trns.blue),
                _ => Trns::Palette(trns.type3_alpha[..trns.n_type3_entries as usize].to_vec()),
            });
        }
        let mut chrm: spng_chrm_int = std::mem::zeroed();
        if chk(spng_get_chrm_int(ctx, &mut chrm))? {
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
        if chk(spng_get_gama_int(ctx, &mut gama))? {
            m.gama = Some(gama);
        }
        let mut iccp: spng_iccp = std::mem::zeroed();
        if chk(spng_get_iccp(ctx, &mut iccp))? {
            m.iccp = Some(Iccp {
                name: cstr(&iccp.profile_name),
                profile: raw(iccp.profile as *const u8, iccp.profile_len),
            });
        }
        let mut sbit: spng_sbit = std::mem::zeroed();
        if chk(spng_get_sbit(ctx, &mut sbit))? {
            m.sbit = Some(Sbit {
                grayscale: sbit.grayscale_bits,
                red: sbit.red_bits,
                green: sbit.green_bits,
                blue: sbit.blue_bits,
                alpha: sbit.alpha_bits,
            });
        }
        let mut srgb: u8 = 0;
        if chk(spng_get_srgb(ctx, &mut srgb))? {
            m.srgb = Some(srgb);
        }
        let mut n_text: u32 = 0;
        if chk(spng_get_text(ctx, std::ptr::null_mut(), &mut n_text))? && n_text > 0 {
            let mut texts: Vec<spng_text> = vec![std::mem::zeroed(); n_text as usize];
            if spng_get_text(ctx, texts.as_mut_ptr(), &mut n_text) == 0 {
                for t in &texts {
                    let kind = match t.type_ as u32 {
                        x if x == spng_text_type_SPNG_TEXT => TextKind::Text,
                        x if x == spng_text_type_SPNG_ZTXT => TextKind::Ztxt,
                        _ => TextKind::Itxt,
                    };
                    m.text.push(Text {
                        kind,
                        keyword: cstr(&t.keyword),
                        text: raw(t.text as *const u8, t.length),
                        compressed: match kind {
                            TextKind::Text => false,
                            TextKind::Ztxt => true,
                            TextKind::Itxt => t.compression_flag == 1,
                        },
                        language_tag: if kind == TextKind::Itxt {
                            cstr_ptr(t.language_tag)
                        } else {
                            vec![]
                        },
                        translated_keyword: if kind == TextKind::Itxt {
                            cstr_ptr(t.translated_keyword)
                        } else {
                            vec![]
                        },
                    });
                }
            }
        }
        let mut bkgd: spng_bkgd = std::mem::zeroed();
        if chk(spng_get_bkgd(ctx, &mut bkgd))? {
            m.bkgd = Some(match color_type {
                0 | 4 => Bkgd::Gray(bkgd.gray),
                2 | 6 => Bkgd::Rgb(bkgd.red, bkgd.green, bkgd.blue),
                _ => Bkgd::Palette(bkgd.plte_index as u8),
            });
        }
        let mut hist: spng_hist = std::mem::zeroed();
        if chk(spng_get_hist(ctx, &mut hist))? {
            let n = m.palette.as_ref().map_or(0, |p| p.entries.len());
            m.hist = Some(hist.frequency[..n].to_vec());
        }
        let mut phys: spng_phys = std::mem::zeroed();
        if chk(spng_get_phys(ctx, &mut phys))? {
            m.phys = Some(Phys { ppu_x: phys.ppu_x, ppu_y: phys.ppu_y, unit: phys.unit_specifier });
        }
        let mut n_splt: u32 = 0;
        if chk(spng_get_splt(ctx, std::ptr::null_mut(), &mut n_splt))? && n_splt > 0 {
            let mut splts: Vec<spng_splt> = vec![std::mem::zeroed(); n_splt as usize];
            if spng_get_splt(ctx, splts.as_mut_ptr(), &mut n_splt) == 0 {
                for s in &splts {
                    m.splt.push(Splt {
                        name: cstr(&s.name),
                        sample_depth: s.sample_depth,
                        entries: std::slice::from_raw_parts(s.entries, s.n_entries as usize)
                            .iter()
                            .map(|e| SpltEntry {
                                red: e.red,
                                green: e.green,
                                blue: e.blue,
                                alpha: e.alpha,
                                frequency: e.frequency,
                            })
                            .collect(),
                    });
                }
            }
        }
        let mut time: spng_time = std::mem::zeroed();
        if chk(spng_get_time(ctx, &mut time))? {
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
        if chk(spng_get_offs(ctx, &mut offs))? {
            m.offs = Some(Offs { x: offs.x, y: offs.y, unit: offs.unit_specifier });
        }
        let mut exif: spng_exif = std::mem::zeroed();
        if chk(spng_get_exif(ctx, &mut exif))? {
            m.exif = Some(raw(exif.data as *const u8, exif.length));
        }
        let mut n_unknown: u32 = 0;
        if chk(spng_get_unknown_chunks(ctx, std::ptr::null_mut(), &mut n_unknown))? && n_unknown > 0 {
            let mut chunks: Vec<spng_unknown_chunk> = vec![std::mem::zeroed(); n_unknown as usize];
            if spng_get_unknown_chunks(ctx, chunks.as_mut_ptr(), &mut n_unknown) == 0 {
                let c = &chunks[0];
                let location = match c.location {
                    x if x == spng_location_SPNG_AFTER_IHDR => Location::AfterIhdr,
                    x if x == spng_location_SPNG_AFTER_PLTE => Location::AfterPlte,
                    _ => Location::AfterIdat,
                };
                m.unknown.push(UnknownChunk { kind: c.type_, data: raw(c.data as *const u8, c.length), location });
            }
        }

        Some(m)
    }
}
