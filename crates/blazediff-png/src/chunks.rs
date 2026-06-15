//! Pre-IDAT chunk walker replicating libspng's default (non-strict) decode
//! validation byte for byte.
//!
//! The parity contract (established by reading spng.c, matching the spng
//! configuration blazediff uses: `SPNG_CRC_USE` for critical and ancillary
//! chunks, `SPNG_CTX_IGNORE_ADLER32`, 64 MB chunk/cache limits):
//!
//! - CRCs are read (4 bytes must be present per pre-IDAT chunk) but never
//!   verified.
//! - Malformed *ancillary* chunks are discarded, not fatal: bad size,
//!   duplicates, bad position, bad keywords, bad embedded zlib streams.
//! - Critical-chunk errors are fatal, as are truncation, chunk lengths over
//!   2^31-1, and the chunk count (1000) / chunk cache (64 MB) limits.
//! - Pixel-affecting state is only IHDR + PLTE + tRNS. Everything else is
//!   parsed solely to reproduce spng's accept/reject behavior, including
//!   inflating zTXt/iTXt/iCCP streams against the cache limit (zip bombs are
//!   a *fatal* SPNG_ECHUNK_LIMITS in spng because the limit error is not in
//!   its recoverable-error list).
//! - Walking stops at the first IDAT; spng never reads past the IDAT run
//!   (no IEND required, trailing bytes ignored).

use crate::backend;
use crate::error::PngError;
use crate::meta::{self, Location, Metadata};

pub const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];

/// spng_u32max: the PNG standard's chunk-length / dimension ceiling.
const U31_MAX: u32 = i32::MAX as u32;
/// SPNG_MAX_CHUNK_COUNT.
const CHUNK_COUNT_LIMIT: u32 = 1000;
/// blazediff's spng_set_chunk_limits(64 MB, 64 MB).
const CACHE_LIMIT: u64 = 64 * 1024 * 1024;
pub(crate) const MAX_CHUNK_SIZE: u64 = 64 * 1024 * 1024;
/// sizeof(struct spng_text2) on LP64 (arm64/x86_64 macOS/Linux).
const SIZEOF_TEXT2: u64 = 144;
/// sizeof(struct spng_splt) on LP64.
const SIZEOF_SPLT: u64 = 96;
/// sizeof(struct spng_splt_entry) (five u16 fields, no padding).
const SIZEOF_SPLT_ENTRY: u64 = 10;

pub const COLOR_GRAYSCALE: u8 = 0;
pub const COLOR_TRUECOLOR: u8 = 2;
pub const COLOR_INDEXED: u8 = 3;
pub const COLOR_GRAYSCALE_ALPHA: u8 = 4;
pub const COLOR_TRUECOLOR_ALPHA: u8 = 6;

#[derive(Debug, Clone, Copy)]
pub struct Ihdr {
    pub width: u32,
    pub height: u32,
    pub bit_depth: u8,
    pub color_type: u8,
    pub interlace: u8,
}

impl Ihdr {
    pub fn channels(&self) -> usize {
        match self.color_type {
            COLOR_TRUECOLOR => 3,
            COLOR_GRAYSCALE_ALPHA => 2,
            COLOR_TRUECOLOR_ALPHA => 4,
            _ => 1, // grayscale, indexed
        }
    }

    /// Filter-unit stride in bytes (spng's `bytes_per_pixel`): 1 for
    /// sub-byte depths, channels * depth/8 otherwise.
    pub fn filter_bpp(&self) -> usize {
        if self.bit_depth < 8 {
            1
        } else {
            self.channels() * (self.bit_depth as usize / 8)
        }
    }

    /// Scanline width in bytes including the leading filter byte.
    pub fn scanline_width(&self, width: u32) -> Result<usize, PngError> {
        let bits = (self.channels() as u64) * (self.bit_depth as u64) * (width as u64);
        let bytes = bits.checked_add(15).ok_or(PngError::Overflow)? / 8;
        if bytes > u32::MAX as u64 {
            return Err(PngError::Overflow);
        }
        Ok(bytes as usize)
    }
}

#[derive(Debug, Clone)]
pub enum Trns {
    /// Gray key, raw u16 from the chunk (unmasked — spng compares the full
    /// value against the raw sample).
    Gray(u16),
    /// RGB key, raw u16 triplet from the chunk.
    Rgb([u16; 3]),
    /// Palette alpha entries (length <= palette entries).
    Palette(Vec<u8>),
}

/// spng's palette state: a fixed zero-initialized 256-entry array that
/// accepted PLTE chunks overwrite *in place*. spng has no duplicate-PLTE
/// check, so a second, shorter PLTE lowers n_entries while leaving the
/// first palette's leftover colors in the tail — and the decode LUT reads
/// all 256 entries (found by differential fuzzing).
pub struct Plte {
    pub entries: [[u8; 3]; 256],
    pub n_entries: usize,
}

pub struct PreIdat {
    pub ihdr: Ihdr,
    pub plte: Option<Plte>,
    pub trns: Option<Trns>,
    /// Byte offset of the first IDAT chunk's length field.
    pub first_idat: usize,
}

/// spng's chunk count + cache accounting. Counts persist across discarded
/// chunks (spng never decrements chunk_count_total); usage is rolled back
/// only on the undo paths spng actually takes.
struct Limits {
    count: u32,
    usage: u64,
}

impl Limits {
    fn count_chunk(&mut self) -> Result<(), PngError> {
        self.count += 1;
        if self.count > CHUNK_COUNT_LIMIT {
            return Err(PngError::ChunkLimits);
        }
        Ok(())
    }

    fn add(&mut self, bytes: u64) -> Result<(), PngError> {
        let new = self.usage.checked_add(bytes).ok_or(PngError::Overflow)?;
        if new > CACHE_LIMIT {
            return Err(PngError::ChunkLimits);
        }
        self.usage = new;
        Ok(())
    }

    fn remove(&mut self, bytes: u64) {
        self.usage = self.usage.saturating_sub(bytes);
    }
}

/// Outcome of one ancillary chunk handler: spng's non-strict mode discards
/// chunks with recoverable errors and continues.
enum Handled {
    Ok,
    Discard,
}

/// File-level flags mirroring ctx->file: set at the same points spng sets
/// them (some before validation, some after — the ordering affects later
/// duplicate / position checks).
#[derive(Default)]
struct FileFlags {
    plte: bool,
    trns: bool,
    chrm: bool,
    gama: bool,
    sbit: bool,
    srgb: bool,
    bkgd: bool,
    hist: bool,
    phys: bool,
    time: bool,
    offs: bool,
    exif: bool,
    iccp: bool,
}

/// Fast path: pixel-relevant chunks only, no metadata retention (blazediff's
/// hot path). Behaviorally identical to passing a `None` capture sink.
pub fn parse_pre_idat(data: &[u8]) -> Result<PreIdat, PngError> {
    parse(data, &mut None)
}

/// Full pass: same accept/reject as [`parse_pre_idat`] up to the first IDAT,
/// plus typed capture of every ancillary chunk (and a lenient harvest of
/// trailing chunks after the IDAT run).
pub fn parse_all(data: &[u8]) -> Result<(PreIdat, Metadata), PngError> {
    let mut cap = Some(Metadata::default());
    let pre = parse(data, &mut cap)?;
    Ok((pre, cap.unwrap()))
}

fn parse(data: &[u8], capture: &mut Option<Metadata>) -> Result<PreIdat, PngError> {
    if data.len() < 8 || data[..8] != PNG_SIG {
        return Err(PngError::Signature);
    }

    // --- IHDR: must be the first chunk, length 13 (spng read_ihdr). ---
    if data.len() < 8 + 25 {
        // signature + length + type + 13 payload (+ CRC checked below)
        return Err(if data.len() < 8 + 8 {
            PngError::UnexpectedEof
        } else if read_u32(data, 8) != 13 || &data[12..16] != b"IHDR" {
            PngError::NoIhdr
        } else {
            PngError::UnexpectedEof
        });
    }
    if read_u32(data, 8) != 13 || &data[12..16] != b"IHDR" {
        return Err(PngError::NoIhdr);
    }
    let ihdr = Ihdr {
        width: read_u32(data, 16),
        height: read_u32(data, 20),
        bit_depth: data[24],
        color_type: data[25],
        interlace: data[28],
    };
    check_ihdr(&ihdr, data[26], data[27])?;

    let mut pos = 8 + 8 + 13; // at IHDR's CRC
    let mut flags = FileFlags::default();
    let mut limits = Limits { count: 0, usage: 0 };
    let mut plte = Plte {
        entries: [[0u8; 3]; 256],
        n_entries: 0,
    };
    let mut trns: Option<Trns> = None;
    let mut location = Location::AfterIhdr;

    loop {
        // read_header: previous chunk's CRC (4 bytes, unverified) + next
        // chunk's 8-byte header must be present.
        if pos + 4 + 8 > data.len() {
            return Err(PngError::UnexpectedEof);
        }
        let hdr = pos + 4;
        let len = read_u32(data, hdr);
        if len > U31_MAX {
            return Err(PngError::ChunkStdLen);
        }
        let len = len as usize;
        let ty: [u8; 4] = data[hdr + 4..hdr + 8].try_into().unwrap();
        let payload_start = hdr + 8;
        let payload_end = payload_start.checked_add(len).ok_or(PngError::Overflow)?;

        if &ty == b"IDAT" {
            if ihdr.color_type == COLOR_INDEXED && !flags.plte {
                return Err(PngError::NoPlte);
            }
            let pre = PreIdat {
                ihdr,
                plte: flags.plte.then_some(plte),
                trns,
                first_idat: hdr,
            };
            if let Some(m) = capture.as_mut() {
                // Harvest trailing tEXt/zTXt/iTXt/tIME/eXIf + unknown chunks
                // that sit after the IDAT run (lenient: stops on the first
                // malformed/illegal trailing chunk rather than erroring, so
                // the pixel decode's "trailing bytes ignored" stays intact).
                capture_after_idat(data, hdr, &pre.ihdr, &mut limits, m);
            }
            return Ok(pre);
        }

        // Every non-IDAT chunk's payload is fully read (or discarded), so it
        // must be present; its CRC presence is enforced on the next loop
        // iteration, matching spng's deferred CRC read.
        if payload_end > data.len() {
            return Err(PngError::UnexpectedEof);
        }
        let payload = &data[payload_start..payload_end];

        let critical = ty[0] & 0x20 == 0;
        if critical {
            match &ty {
                b"PLTE" => {
                    if flags.trns || flags.hist || flags.bkgd {
                        return Err(PngError::ChunkPos);
                    }
                    if !len.is_multiple_of(3) {
                        return Err(PngError::ChunkSize);
                    }
                    let n = len / 3;
                    if n == 0 || n > 256 {
                        return Err(PngError::ChunkSize);
                    }
                    if ihdr.color_type == COLOR_INDEXED && n > (1usize << ihdr.bit_depth) {
                        return Err(PngError::ChunkSize);
                    }
                    for (entry, rgb) in plte.entries.iter_mut().zip(payload.chunks_exact(3)) {
                        *entry = [rgb[0], rgb[1], rgb[2]];
                    }
                    plte.n_entries = n;
                    flags.plte = true;
                    location = Location::AfterPlte;
                    if let Some(m) = capture.as_mut() {
                        m.palette = Some(meta::Palette {
                            entries: plte.entries[..n].to_vec(),
                        });
                    }
                }
                b"IEND" => return Err(PngError::ChunkPos),
                b"IHDR" => return Err(PngError::ChunkPos),
                _ => return Err(PngError::UnknownCritical),
            }
        } else {
            // spng rejects zero-length standard "small" chunks before
            // dispatch; for ancillary ones that is a recoverable discard.
            let small = matches!(
                &ty,
                b"cHRM"
                    | b"gAMA"
                    | b"sBIT"
                    | b"sRGB"
                    | b"bKGD"
                    | b"tRNS"
                    | b"hIST"
                    | b"pHYs"
                    | b"tIME"
                    | b"oFFs"
            );
            let handled = if small && len == 0 {
                Handled::Discard
            } else {
                handle_ancillary(
                    &ty,
                    payload,
                    &ihdr,
                    &mut flags,
                    &mut limits,
                    &plte,
                    &mut trns,
                    capture,
                    location,
                )?
            };
            // Discarded chunks: spng drains the remaining bytes and
            // continues. Payload presence is already guaranteed above.
            let _ = handled;
        }

        pos = payload_end; // next iteration reads this chunk's CRC first
    }
}

fn check_ihdr(ihdr: &Ihdr, compression_method: u8, filter_method: u8) -> Result<(), PngError> {
    if ihdr.width == 0 || ihdr.width > U31_MAX {
        return Err(PngError::InvalidIhdr);
    }
    if ihdr.height == 0 || ihdr.height > U31_MAX {
        return Err(PngError::InvalidIhdr);
    }
    let depth_ok = match ihdr.color_type {
        COLOR_GRAYSCALE => matches!(ihdr.bit_depth, 1 | 2 | 4 | 8 | 16),
        COLOR_TRUECOLOR | COLOR_GRAYSCALE_ALPHA | COLOR_TRUECOLOR_ALPHA => {
            matches!(ihdr.bit_depth, 8 | 16)
        }
        COLOR_INDEXED => matches!(ihdr.bit_depth, 1 | 2 | 4 | 8),
        _ => return Err(PngError::InvalidIhdr),
    };
    if !depth_ok {
        return Err(PngError::InvalidIhdr);
    }
    if compression_method != 0 || filter_method != 0 {
        return Err(PngError::InvalidIhdr);
    }
    if ihdr.interlace > 1 {
        return Err(PngError::InvalidIhdr);
    }
    Ok(())
}

/// One ancillary chunk. `Err` = fatal (limits/overflow), `Ok(Discard)` =
/// spng's recoverable discard, `Ok(Ok)` = accepted. When `capture` is `Some`,
/// the accepted value is recorded into it — strictly additive, never altering
/// the accept/reject outcome.
#[allow(clippy::too_many_arguments)]
fn handle_ancillary(
    ty: &[u8; 4],
    payload: &[u8],
    ihdr: &Ihdr,
    flags: &mut FileFlags,
    limits: &mut Limits,
    plte: &Plte,
    trns: &mut Option<Trns>,
    capture: &mut Option<Metadata>,
    location: Location,
) -> Result<Handled, PngError> {
    let len = payload.len();
    match ty {
        b"cHRM" => {
            if flags.plte || flags.chrm || len != 32 {
                return Ok(Handled::Discard);
            }
            for i in 0..8 {
                if read_u32(payload, i * 4) > U31_MAX {
                    return Ok(Handled::Discard);
                }
            }
            flags.chrm = true;
            if let Some(m) = capture.as_mut() {
                m.chrm = Some(meta::Chrm {
                    white_x: read_u32(payload, 0),
                    white_y: read_u32(payload, 4),
                    red_x: read_u32(payload, 8),
                    red_y: read_u32(payload, 12),
                    green_x: read_u32(payload, 16),
                    green_y: read_u32(payload, 20),
                    blue_x: read_u32(payload, 24),
                    blue_y: read_u32(payload, 28),
                });
            }
        }
        b"gAMA" => {
            if flags.plte || flags.gama || len != 4 {
                return Ok(Handled::Discard);
            }
            let gama = read_u32(payload, 0);
            if gama == 0 || gama > U31_MAX {
                return Ok(Handled::Discard);
            }
            flags.gama = true;
            if let Some(m) = capture.as_mut() {
                m.gama = Some(gama);
            }
        }
        b"sBIT" => {
            if flags.plte || flags.sbit {
                return Ok(Handled::Discard);
            }
            let ok = match ihdr.color_type {
                COLOR_GRAYSCALE => len == 1 && payload[0] != 0 && payload[0] <= ihdr.bit_depth,
                COLOR_TRUECOLOR | COLOR_INDEXED => {
                    let depth = if ihdr.color_type == COLOR_INDEXED {
                        8
                    } else {
                        ihdr.bit_depth
                    };
                    len == 3 && payload.iter().all(|&b| b != 0 && b <= depth)
                }
                COLOR_GRAYSCALE_ALPHA => {
                    len == 2 && payload.iter().all(|&b| b != 0 && b <= ihdr.bit_depth)
                }
                _ => len == 4 && payload.iter().all(|&b| b != 0 && b <= ihdr.bit_depth),
            };
            if !ok {
                return Ok(Handled::Discard);
            }
            flags.sbit = true;
            if let Some(m) = capture.as_mut() {
                let mut s = meta::Sbit::default();
                match ihdr.color_type {
                    COLOR_GRAYSCALE => s.grayscale = payload[0],
                    COLOR_TRUECOLOR | COLOR_INDEXED => {
                        s.red = payload[0];
                        s.green = payload[1];
                        s.blue = payload[2];
                    }
                    COLOR_GRAYSCALE_ALPHA => {
                        s.grayscale = payload[0];
                        s.alpha = payload[1];
                    }
                    _ => {
                        s.red = payload[0];
                        s.green = payload[1];
                        s.blue = payload[2];
                        s.alpha = payload[3];
                    }
                }
                m.sbit = Some(s);
            }
        }
        b"sRGB" => {
            if flags.plte || flags.srgb || len != 1 || payload[0] > 3 {
                return Ok(Handled::Discard);
            }
            flags.srgb = true;
            if let Some(m) = capture.as_mut() {
                m.srgb = Some(payload[0]);
            }
        }
        b"bKGD" => {
            if flags.bkgd {
                return Ok(Handled::Discard);
            }
            let ok = match ihdr.color_type {
                COLOR_GRAYSCALE | COLOR_GRAYSCALE_ALPHA => len == 2,
                COLOR_TRUECOLOR | COLOR_TRUECOLOR_ALPHA => len == 6,
                _ => {
                    if len != 1 {
                        false
                    } else if !flags.plte {
                        return Ok(Handled::Discard); // EBKGD_NO_PLTE
                    } else {
                        (payload[0] as usize) < plte.n_entries
                    }
                }
            };
            if !ok {
                return Ok(Handled::Discard);
            }
            flags.bkgd = true;
            if let Some(m) = capture.as_mut() {
                m.bkgd = Some(match ihdr.color_type {
                    COLOR_GRAYSCALE | COLOR_GRAYSCALE_ALPHA => {
                        meta::Bkgd::Gray(read_u16(payload, 0))
                    }
                    COLOR_TRUECOLOR | COLOR_TRUECOLOR_ALPHA => meta::Bkgd::Rgb(
                        read_u16(payload, 0),
                        read_u16(payload, 2),
                        read_u16(payload, 4),
                    ),
                    _ => meta::Bkgd::Palette(payload[0]),
                });
            }
        }
        b"tRNS" => {
            if flags.trns {
                return Ok(Handled::Discard);
            }
            match ihdr.color_type {
                COLOR_GRAYSCALE => {
                    if len != 2 {
                        return Ok(Handled::Discard);
                    }
                    *trns = Some(Trns::Gray(read_u16(payload, 0)));
                    if let Some(m) = capture.as_mut() {
                        m.transparency = Some(meta::Trns::Gray(read_u16(payload, 0)));
                    }
                }
                COLOR_TRUECOLOR => {
                    if len != 6 {
                        return Ok(Handled::Discard);
                    }
                    *trns = Some(Trns::Rgb([
                        read_u16(payload, 0),
                        read_u16(payload, 2),
                        read_u16(payload, 4),
                    ]));
                    if let Some(m) = capture.as_mut() {
                        m.transparency = Some(meta::Trns::Rgb(
                            read_u16(payload, 0),
                            read_u16(payload, 2),
                            read_u16(payload, 4),
                        ));
                    }
                }
                COLOR_INDEXED => {
                    // Size check first (against 0 entries when PLTE absent),
                    // exactly like spng — so tRNS-before-PLTE is a size error
                    // discard, not ETRNS_NO_PLTE.
                    if len > plte.n_entries || !flags.plte {
                        return Ok(Handled::Discard);
                    }
                    *trns = Some(Trns::Palette(payload.to_vec()));
                    if let Some(m) = capture.as_mut() {
                        m.transparency = Some(meta::Trns::Palette(payload.to_vec()));
                    }
                }
                _ => return Ok(Handled::Discard), // ETRNS_COLOR_TYPE
            }
            flags.trns = true;
        }
        b"hIST" => {
            if !flags.plte || flags.hist {
                return Ok(Handled::Discard);
            }
            if len / 2 != plte.n_entries {
                return Ok(Handled::Discard);
            }
            flags.hist = true;
            if let Some(m) = capture.as_mut() {
                m.hist = Some(
                    (0..plte.n_entries)
                        .map(|i| read_u16(payload, i * 2))
                        .collect(),
                );
            }
        }
        b"pHYs" => {
            if flags.phys || len != 9 || payload[8] > 1 {
                return Ok(Handled::Discard);
            }
            if read_u32(payload, 0) > U31_MAX || read_u32(payload, 4) > U31_MAX {
                return Ok(Handled::Discard);
            }
            flags.phys = true;
            if let Some(m) = capture.as_mut() {
                m.phys = Some(meta::Phys {
                    ppu_x: read_u32(payload, 0),
                    ppu_y: read_u32(payload, 4),
                    unit: payload[8],
                });
            }
        }
        b"tIME" => {
            if flags.time || len != 7 {
                return Ok(Handled::Discard);
            }
            let (month, day, hour, minute, second) =
                (payload[2], payload[3], payload[4], payload[5], payload[6]);
            if month == 0
                || month > 12
                || day == 0
                || day > 31
                || hour > 23
                || minute > 59
                || second > 60
            {
                return Ok(Handled::Discard);
            }
            flags.time = true;
            if let Some(m) = capture.as_mut() {
                m.time = Some(meta::Time {
                    year: read_u16(payload, 0),
                    month,
                    day,
                    hour,
                    minute,
                    second,
                });
            }
        }
        b"oFFs" => {
            if flags.offs || len != 9 || payload[8] > 1 {
                return Ok(Handled::Discard);
            }
            flags.offs = true;
            if let Some(m) = capture.as_mut() {
                m.offs = Some(meta::Offs {
                    x: read_u32(payload, 0) as i32,
                    y: read_u32(payload, 4) as i32,
                    unit: payload[8],
                });
            }
        }
        b"eXIf" => {
            if flags.exif {
                return Ok(Handled::Discard);
            }
            if len == 0 {
                return Ok(Handled::Discard);
            }
            flags.exif = true;
            // spng allocates (count + cache) before validating content and
            // never rolls either back for this chunk.
            limits.add(len as u64)?;
            limits.count_chunk()?;
            let le = [73u8, 73, 42, 0];
            let be = [77u8, 77, 0, 42];
            if len < 4 || (payload[..4] != le && payload[..4] != be) {
                return Ok(Handled::Discard);
            }
            if let Some(m) = capture.as_mut() {
                m.exif = Some(payload.to_vec());
            }
        }
        b"iCCP" => {
            if flags.plte || flags.iccp {
                return Ok(Handled::Discard);
            }
            if len == 0 {
                return Ok(Handled::Discard);
            }
            flags.iccp = true;
            let peek = len.min(81);
            let Some(nul) = payload[..peek].iter().position(|&b| b == 0) else {
                return Ok(Handled::Discard); // EICCP_NAME
            };
            if nul > 79 || !check_png_keyword(&payload[..nul]) {
                return Ok(Handled::Discard);
            }
            if len < nul + 2 {
                return Ok(Handled::Discard); // ECHUNK_SIZE
            }
            if payload[nul + 1] != 0 {
                return Ok(Handled::Discard); // EICCP_COMPRESSION_METHOD
            }
            let profile = match inflate_capped_bytes(&payload[nul + 2..], limits, 0)? {
                Some(b) => b,
                None => return Ok(Handled::Discard), // EZLIB
            };
            limits.add(profile.len() as u64)?;
            if let Some(m) = capture.as_mut() {
                m.iccp = Some(meta::Iccp {
                    name: payload[..nul].to_vec(),
                    profile,
                });
            }
        }
        b"tEXt" | b"zTXt" | b"iTXt" => {
            return handle_text(ty, payload, limits, capture);
        }
        b"sPLT" => {
            if len == 0 {
                return Ok(Handled::Discard);
            }
            // Count + chunk.length + struct overhead charged up front; the
            // chunk.length share is never rolled back on discard (spng's
            // splt_undo only frees the struct + entries).
            limits.add(len as u64 + SIZEOF_SPLT)?;
            limits.count_chunk()?;
            let discard = |limits: &mut Limits| {
                limits.remove(SIZEOF_SPLT);
                Ok(Handled::Discard)
            };
            let keyword_len = len.min(80);
            let Some(nul) = payload[..keyword_len].iter().position(|&b| b == 0) else {
                return discard(limits);
            };
            if !check_png_keyword(&payload[..nul]) {
                return discard(limits);
            }
            // spng also rejects duplicate sPLT names; tracking names has no
            // pixel effect and both outcomes are "discard", so skip it.
            if len - nul <= 2 {
                return discard(limits);
            }
            let sample_depth = payload[nul + 1];
            let entries_len = len - nul - 2;
            let n_entries = match sample_depth {
                16 if entries_len.is_multiple_of(10) => entries_len / 10,
                8 if entries_len.is_multiple_of(6) => entries_len / 6,
                _ => return discard(limits),
            };
            if n_entries == 0 {
                return discard(limits);
            }
            limits.add(n_entries as u64 * SIZEOF_SPLT_ENTRY)?;
            if let Some(m) = capture.as_mut() {
                let body = &payload[nul + 2..];
                let entries = (0..n_entries)
                    .map(|i| {
                        if sample_depth == 16 {
                            let o = i * 10;
                            meta::SpltEntry {
                                red: read_u16(body, o),
                                green: read_u16(body, o + 2),
                                blue: read_u16(body, o + 4),
                                alpha: read_u16(body, o + 6),
                                frequency: read_u16(body, o + 8),
                            }
                        } else {
                            let o = i * 6;
                            meta::SpltEntry {
                                red: body[o] as u16,
                                green: body[o + 1] as u16,
                                blue: body[o + 2] as u16,
                                alpha: body[o + 3] as u16,
                                frequency: read_u16(body, o + 4),
                            }
                        }
                    })
                    .collect();
                m.splt.push(meta::Splt {
                    name: payload[..nul].to_vec(),
                    sample_depth,
                    entries,
                });
            }
        }
        _ => {
            // Unknown ancillary chunk: spng's default decoder discards these
            // (keep_unknown off). We retain them — a superset useful for a
            // standalone codec — recording verbatim with their location.
            if let Some(m) = capture.as_mut() {
                m.unknown.push(meta::UnknownChunk {
                    kind: *ty,
                    data: payload.to_vec(),
                    location,
                });
            }
        }
    }
    Ok(Handled::Ok)
}

/// tEXt / zTXt / iTXt. Affects accept/reject only through the chunk count
/// and cache limits (text content checks are non-strict discards). On accept
/// records the typed [`meta::Text`] when capturing.
fn handle_text(
    ty: &[u8; 4],
    payload: &[u8],
    limits: &mut Limits,
    capture: &mut Option<Metadata>,
) -> Result<Handled, PngError> {
    let len = payload.len();
    if len == 0 {
        return Ok(Handled::Discard);
    }
    // Counted and charged before any parsing; the count is never rolled
    // back, the struct usage is (text_undo).
    limits.add(SIZEOF_TEXT2)?;
    limits.count_chunk()?;
    let discard = |limits: &mut Limits, extra: u64| {
        limits.remove(SIZEOF_TEXT2 + extra);
        Ok(Handled::Discard)
    };

    let peek = len.min(256);
    let Some(nul) = payload[..len.min(80)].iter().position(|&b| b == 0) else {
        return discard(limits, 0);
    };
    let keyword_len = nul;

    // text_offset is the compressed/iTXt text start; lang/translated are the
    // iTXt-only byte ranges (empty for tEXt/zTXt).
    let (compressed, text_offset, lang, translated) = match ty {
        b"tEXt" => (false, keyword_len + 1, 0..0, 0..0),
        b"zTXt" => {
            if peek - keyword_len <= 2 {
                return discard(limits, 0);
            }
            if payload[keyword_len + 1] != 0 {
                return discard(limits, 0);
            }
            (true, keyword_len + 2, 0..0, 0..0)
        }
        _ => {
            // iTXt
            if peek - keyword_len < 5 {
                return discard(limits, 0);
            }
            let compression_flag = payload[keyword_len + 1];
            if compression_flag > 1 {
                return discard(limits, 0);
            }
            if payload[keyword_len + 2] != 0 {
                return discard(limits, 0);
            }
            let lang_off = keyword_len + 3;
            let Some(term) = payload[lang_off..peek].iter().position(|&b| b == 0) else {
                return discard(limits, 0);
            };
            let term = lang_off + term;
            if peek - term < 2 {
                return discard(limits, 0);
            }
            let tk_off = term + 1;
            let Some(z) = payload[tk_off..peek].iter().position(|&b| b == 0) else {
                return discard(limits, 0);
            };
            (
                compression_flag == 1,
                tk_off + z + 1,
                lang_off..term,
                tk_off..tk_off + z,
            )
        }
    };

    let (extra, text_bytes) = if compressed {
        limits.add(peek as u64)?;
        match inflate_capped_bytes(&payload[text_offset..], limits, 1)? {
            Some(b) => {
                let size = b.len() as u64 + 1;
                limits.add(size)?;
                (peek as u64 + size, b)
            }
            None => return discard(limits, peek as u64), // EZLIB
        }
    } else {
        limits.add(len as u64 + 1)?;
        // tEXt text is everything after the keyword NUL; iTXt uncompressed
        // text starts after the translated-keyword NUL.
        let start = if ty == b"tEXt" {
            keyword_len + 1
        } else {
            text_offset
        };
        (len as u64 + 1, payload.get(start..).unwrap_or(&[]).to_vec())
    };

    if !check_png_keyword(&payload[..keyword_len]) {
        return discard(limits, extra);
    }
    if let Some(m) = capture.as_mut() {
        let kind = match ty {
            b"tEXt" => meta::TextKind::Text,
            b"zTXt" => meta::TextKind::Ztxt,
            _ => meta::TextKind::Itxt,
        };
        // spng exposes text as a C string (`text_length = strlen(text)`), so a
        // stray NUL truncates it; valid PNG text never contains one. Match that
        // for byte-exact `spng_get_text` parity.
        let mut text = text_bytes;
        if let Some(nul) = text.iter().position(|&b| b == 0) {
            text.truncate(nul);
        }
        m.text.push(meta::Text {
            kind,
            keyword: payload[..keyword_len].to_vec(),
            text,
            compressed,
            language_tag: payload.get(lang).unwrap_or(&[]).to_vec(),
            translated_keyword: payload.get(translated).unwrap_or(&[]).to_vec(),
        });
    }
    Ok(Handled::Ok)
}

/// Replicates spng__inflate_stream's growth/limit behavior: an 8 KB buffer
/// doubling while `size <= max/2`, where max = min(MAX_CHUNK_SIZE,
/// CACHE_LIMIT - usage) - extra. Returns the decompressed bytes on a complete
/// zlib stream, Ok(None) for spng's recoverable EZLIB (bad stream, empty
/// output, or input exhausted), Err for the fatal limit overflow. The caller
/// charges `bytes.len() (+ extra)` against the cache, matching spng.
fn inflate_capped_bytes(
    input: &[u8],
    limits: &Limits,
    extra: u64,
) -> Result<Option<Vec<u8>>, PngError> {
    let mut max = CACHE_LIMIT - limits.usage;
    if MAX_CHUNK_SIZE < max {
        max = MAX_CHUNK_SIZE;
    }
    if extra > max {
        return Err(PngError::ChunkLimits);
    }
    max -= extra;

    match backend::inflate_stream(input, max) {
        Ok(b) if b.is_empty() => Ok(None),
        Ok(b) => Ok(Some(b)),
        Err(backend::StreamInflateError::Limit) => Err(PngError::ChunkLimits),
        Err(_) => Ok(None),
    }
}

/// Lenient harvest of ancillary chunks that follow the IDAT run (only valid
/// for text/tIME/eXIf + unknown chunks per the spec). Stops — rather than
/// erroring — at the first truncated/illegal/critical trailing chunk, so a
/// metadata decode never rejects an input the pixel decode accepts. Shares
/// `flags`/`limits` with the pre-IDAT pass so duplicate-detection and cache
/// accounting stay continuous.
fn capture_after_idat(
    data: &[u8],
    first_idat: usize,
    ihdr: &Ihdr,
    limits: &mut Limits,
    m: &mut Metadata,
) {
    let mut pos = first_idat; // length field of the first IDAT
    let mut first = true;
    let mut flags = FileFlags::default();
    let mut trns = None;
    // A PLTE is not present here (post-IDAT), so bKGD/hIST validation that
    // references it would discard anyway; those chunk types are skipped below.
    let plte = Plte {
        entries: [[0u8; 3]; 256],
        n_entries: 0,
    };
    let mut sink = Some(std::mem::take(m));

    loop {
        let hdr = if first { pos } else { pos + 4 };
        if hdr + 8 > data.len() {
            break;
        }
        let len = read_u32(data, hdr);
        if len > U31_MAX {
            break;
        }
        let len = len as usize;
        let ty: [u8; 4] = data[hdr + 4..hdr + 8].try_into().unwrap();
        let start = hdr + 8;
        let Some(end) = start.checked_add(len) else {
            break;
        };
        if end > data.len() {
            break;
        }

        if &ty == b"IDAT" {
            pos = end;
            first = false;
            continue;
        }
        if &ty == b"IEND" {
            break;
        }
        // Only chunks the spec permits after IDAT are harvested; anything else
        // (including misplaced known chunks and any critical chunk) ends the
        // walk to stay conservative.
        let harvestable = matches!(&ty, b"tEXt" | b"zTXt" | b"iTXt" | b"tIME" | b"eXIf")
            || (ty[0] & 0x20 != 0 && !is_known_ancillary(&ty));
        if !harvestable {
            break;
        }
        let payload = &data[start..end];
        if handle_ancillary(
            &ty,
            payload,
            ihdr,
            &mut flags,
            limits,
            &plte,
            &mut trns,
            &mut sink,
            Location::AfterIdat,
        )
        .is_err()
        {
            break;
        }
        pos = end;
        first = false;
    }

    *m = sink.unwrap();
}

/// Standard ancillary chunk types (those with a typed handler). Used to tell a
/// genuinely-unknown trailing chunk from a misplaced known one.
fn is_known_ancillary(ty: &[u8; 4]) -> bool {
    matches!(
        ty,
        b"cHRM"
            | b"gAMA"
            | b"sBIT"
            | b"sRGB"
            | b"bKGD"
            | b"tRNS"
            | b"hIST"
            | b"pHYs"
            | b"tIME"
            | b"oFFs"
            | b"eXIf"
            | b"iCCP"
            | b"tEXt"
            | b"zTXt"
            | b"iTXt"
            | b"sPLT"
    )
}

/// spng's check_png_keyword, minus the NUL handling (callers pass the bytes
/// before the NUL).
fn check_png_keyword(keyword: &[u8]) -> bool {
    if keyword.is_empty() || keyword.len() > 79 {
        return false;
    }
    if keyword[0] == b' ' || *keyword.last().unwrap() == b' ' {
        return false;
    }
    if keyword.windows(2).any(|w| w == b"  ") {
        return false;
    }
    keyword.iter().all(|&c| (32..=126).contains(&c) || c >= 161)
}

#[inline]
pub(crate) fn read_u32(data: &[u8], pos: usize) -> u32 {
    u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap())
}

#[inline]
pub(crate) fn read_u16(data: &[u8], pos: usize) -> u16 {
    u16::from_be_bytes(data[pos..pos + 2].try_into().unwrap())
}
