//! Decode orchestration: chunk walk → inflate → defilter → expand.
//!
//! Byte-exact parity with blazediff's spng reference path
//! (`SPNG_FMT_RGBA8` + `SPNG_DECODE_TRNS`, `SPNG_CTX_IGNORE_ADLER32`,
//! `SPNG_CRC_USE`) on both accepted output and rejected inputs. See
//! chunks.rs for the validation contract and expand.rs for the sample
//! conversion contract.

use std::borrow::Cow;

use crate::backend::{self, IdatInflate};
use crate::chunks::{self, Ihdr};
use crate::convert::{RowConverter, SampleIter};
use crate::defilter;
use crate::error::PngError;
use crate::expand::RowExpander;
use crate::format::{self, DecodeFormat, DecodeOptions, Decoded};
use crate::interlace;
use crate::meta::Sbit;
use crate::Image;

/// One deinterlace pass (or the whole image when not interlaced).
struct Pass {
    width: u32,
    height: u32,
    /// Scanline stride in bytes including the leading filter byte.
    stride: usize,
    /// Offset of this pass's first scanline in the raw inflated stream.
    offset: usize,
    /// Adam7 pass index, usize::MAX for the non-interlaced pseudo-pass.
    index: usize,
}

pub fn decode(data: &[u8]) -> Result<Image, PngError> {
    decode_impl(data, false)
}

/// Fuzz-harness hook: same pipeline with the strict-window zlib-rs inflate
/// (no libdeflate fast path), used to classify streams whose classic-zlib
/// outcome depends on uninitialized window memory.
#[cfg(feature = "fuzzing")]
pub fn decode_strict_window(data: &[u8]) -> Result<Image, PngError> {
    decode_impl(data, true)
}

/// Decode pixels and capture every spng-exposed ancillary chunk. See
/// [`crate::decode_with_metadata`].
pub fn decode_with_metadata(data: &[u8]) -> Result<crate::DecodedPng, PngError> {
    let (pre, meta) = chunks::parse_all(data)?;
    let image = decode_from_pre(data, &pre, false)?;
    Ok(crate::DecodedPng { image, meta })
}

fn decode_impl(data: &[u8], strict: bool) -> Result<Image, PngError> {
    let pre = chunks::parse_pre_idat(data)?;
    decode_from_pre(data, &pre, strict)
}

/// Decode to an arbitrary [`DecodeFormat`] with optional tRNS / gamma / sBIT
/// transforms — byte-exact to spng's `spng_decode_image(fmt, flags)`. The
/// default RGBA8 + tRNS configuration stays on the proven LUT expander.
pub fn decode_with(data: &[u8], opts: &DecodeOptions) -> Result<Decoded, PngError> {
    // gamma / sBIT need the gAMA / sBIT chunk values, captured by the full
    // metadata parse; everything else uses the pixel-only fast parse.
    let need_meta = opts.apply_gamma || opts.apply_sbit;
    let (pre, gama, sbit) = if need_meta {
        let (pre, meta) = chunks::parse_all(data)?;
        (pre, meta.gama, meta.sbit)
    } else {
        (chunks::parse_pre_idat(data)?, None, None)
    };

    format::check_decode_fmt(&pre.ihdr, opts.format)?;

    // Fast path: the historical default decode (RGBA8 + tRNS, no transforms).
    if opts.format == DecodeFormat::Rgba8
        && opts.apply_trns
        && !opts.apply_gamma
        && !opts.apply_sbit
    {
        let img = decode_from_pre(data, &pre, false)?;
        return Ok(Decoded {
            data: img.data,
            width: img.width,
            height: img.height,
            format: DecodeFormat::Rgba8,
            color_type: pre.ihdr.color_type,
            bit_depth: pre.ihdr.bit_depth,
        });
    }

    decode_format(data, &pre, gama, sbit.as_ref(), opts, false)
}

fn decode_format(
    data: &[u8],
    pre: &chunks::PreIdat,
    gama: Option<u32>,
    sbit: Option<&Sbit>,
    opts: &DecodeOptions,
    strict: bool,
) -> Result<Decoded, PngError> {
    let ihdr = &pre.ihdr;
    let fmt = opts.format;

    let passes = build_passes(ihdr)?;

    // spng rejects (pre-IDAT) any pass whose output row exceeds u32, and the
    // full image size must fit size_t.
    let pixel_size = format::output_pixel_size(ihdr, fmt);
    for pass in &passes {
        let out_width = match pixel_size {
            Some(ps) => pass.width as u64 * ps as u64,
            None => (ihdr.scanline_width(pass.width)? - 1) as u64,
        };
        if out_width > u32::MAX as u64 {
            return Err(PngError::Overflow);
        }
    }
    let image_width = format::image_row_bytes(ihdr, fmt)?;
    let out_len = (image_width as u64)
        .checked_mul(ihdr.height as u64)
        .ok_or(PngError::Overflow)?;
    let out_len = usize::try_from(out_len).map_err(|_| PngError::Overflow)?;

    let raw_len = passes
        .last()
        .map(|p| p.offset + p.stride * p.height as usize)
        .expect("at least one non-empty pass");
    let mut raw = try_alloc(raw_len)?;
    inflate_idat_into(data, pre.first_idat, &passes, &mut raw, strict)?;

    let bpp = ihdr.filter_bpp();
    for pass in &passes {
        let seg = &mut raw[pass.offset..pass.offset + pass.stride * pass.height as usize];
        if !defilter::defilter_in_place(seg, pass.stride - 1, pass.height as usize, bpp) {
            return Err(PngError::Filter);
        }
    }

    let conv = RowConverter::new(ihdr, pre.plte.as_ref(), pre.trns.as_ref(), gama, sbit, opts);

    // Interlaced sub-byte PNG/RAW packs samples from every pass into shared
    // output bytes via OR, so the buffer must start zeroed.
    let zero_init = ihdr.interlace != 0
        && matches!(fmt, DecodeFormat::Png | DecodeFormat::Raw)
        && ihdr.bit_depth < 8;
    let mut out = if zero_init {
        try_alloc_zeroed(out_len)?
    } else {
        try_alloc(out_len)?
    };

    if ihdr.interlace == 0 {
        let pass = &passes[0];
        out.chunks_mut(image_width)
            .enumerate()
            .for_each(|(y, dst)| {
                let src =
                    &raw[pass.offset + y * pass.stride + 1..pass.offset + (y + 1) * pass.stride];
                conv.convert_row(src, dst, ihdr.width as usize);
            });
    } else if let Some(ps) = pixel_size {
        for pass in &passes {
            scatter_pass_fmt(pass, &raw, &mut out, image_width, ps, &conv);
        }
    } else {
        // Sub-byte PNG/RAW: sequential across passes (shared output bytes).
        for pass in &passes {
            bit_scatter_pass(pass, &raw, &mut out, image_width, ihdr.bit_depth as u32);
        }
    }

    Ok(Decoded {
        data: out,
        width: ihdr.width,
        height: ihdr.height,
        format: fmt,
        color_type: ihdr.color_type,
        bit_depth: ihdr.bit_depth,
    })
}

/// Byte-aligned interlace scatter: convert each pass scanline to a contiguous
/// row, then place its pixels at their Adam7 columns (spng's `spng_decode_row`
/// memcpy loop, generalized to `pixel_size`).
fn scatter_pass_fmt(
    pass: &Pass,
    raw: &[u8],
    out: &mut [u8],
    image_width: usize,
    ps: usize,
    conv: &RowConverter,
) {
    let p = pass.index;
    let y_start = interlace::Y_START[p] as usize;
    let y_delta = interlace::Y_DELTA[p] as usize;
    let x_start = interlace::X_START[p] as usize;
    let x_delta = interlace::X_DELTA[p] as usize;
    let width = pass.width as usize;

    out.chunks_mut(image_width)
        .enumerate()
        .filter(|(y, _)| *y >= y_start && (*y - y_start).is_multiple_of(y_delta))
        .for_each(|(y, dst)| {
            let i = (y - y_start) / y_delta;
            if i >= pass.height as usize {
                return;
            }
            let src = &raw[pass.offset + i * pass.stride + 1..pass.offset + (i + 1) * pass.stride];
            let mut row = vec![0u8; width * ps];
            conv.convert_row(src, &mut row, width);
            if x_delta == 1 {
                dst[..width * ps].copy_from_slice(&row);
            } else {
                for (k, px) in row.chunks_exact(ps).enumerate() {
                    let x = x_start + k * x_delta;
                    dst[x * ps..x * ps + ps].copy_from_slice(px);
                }
            }
        });
}

/// Sub-byte PNG/RAW interlace scatter: OR each pass sample into its packed
/// bit position (spng's `spng_decode_row` bit-packing branch).
fn bit_scatter_pass(pass: &Pass, raw: &[u8], out: &mut [u8], image_width: usize, bit_depth: u32) {
    let p = pass.index;
    let y_start = interlace::Y_START[p] as usize;
    let y_delta = interlace::Y_DELTA[p] as usize;
    let x_start = interlace::X_START[p] as usize;
    let x_delta = interlace::X_DELTA[p] as usize;
    let width = pass.width as usize;
    let initial_shift = 8 - bit_depth as i32;
    let samples_per_byte = 8 / bit_depth as usize;

    for i in 0..pass.height as usize {
        let y = y_start + i * y_delta;
        let src = &raw[pass.offset + i * pass.stride + 1..pass.offset + (i + 1) * pass.stride];
        let row_out = &mut out[y * image_width..(y + 1) * image_width];
        let mut iter = SampleIter::new(bit_depth, src);
        for k in 0..width {
            let sample = iter.next_sample();
            let ioffset = x_start + k * x_delta;
            let shift = initial_shift - ((ioffset * bit_depth as usize) % 8) as i32;
            let byte = ioffset / samples_per_byte;
            row_out[byte] |= sample.wrapping_shl(shift as u32);
        }
    }
}

fn decode_from_pre(data: &[u8], pre: &chunks::PreIdat, strict: bool) -> Result<Image, PngError> {
    let ihdr = &pre.ihdr;

    let passes = build_passes(ihdr)?;
    let raw_len = passes
        .last()
        .map(|p| p.offset + p.stride * p.height as usize)
        .expect("at least one non-empty pass");

    // spng rejects any pass whose RGBA8 row exceeds u32 (decode-time
    // EOVERFLOW), and the full image size must fit size_t.
    for pass in &passes {
        if pass.width as u64 * 4 > u32::MAX as u64 {
            return Err(PngError::Overflow);
        }
    }
    let out_len = (ihdr.width as u64 * 4)
        .checked_mul(ihdr.height as u64)
        .ok_or(PngError::Overflow)?;
    let out_len = usize::try_from(out_len).map_err(|_| PngError::Overflow)?;

    let mut raw = try_alloc(raw_len)?;
    inflate_idat_into(data, pre.first_idat, &passes, &mut raw, strict)?;

    let bpp = ihdr.filter_bpp();
    let out_stride = ihdr.width as usize * 4;
    let expander = RowExpander::new(ihdr, pre.plte.as_ref(), pre.trns.as_ref());
    let mut out = try_alloc(out_len)?;
    let width = ihdr.width as usize;

    // Filter bytes are validated up front (inside the defilter routines) before
    // defiltering. spng validates per scanline while inflating lazily; batching
    // the whole stream first can't change accept/reject — any input where spng
    // stops at a bad filter byte has either a complete stream (we hit the same
    // byte) or a broken one (we reject on the stream instead).
    if ihdr.interlace == 0 {
        // Non-interlaced: defilter and expand each row in one fused pass, so a
        // row is consumed by the expander while still hot in cache instead of
        // re-streaming the whole raw buffer for a separate expand sweep.
        let pass = &passes[0];
        let seg = &mut raw[..pass.stride * pass.height as usize];
        let ok = defilter::defilter_in_place_expand(
            seg,
            pass.stride - 1,
            pass.height as usize,
            bpp,
            |y, row| {
                expander.expand_row(row, &mut out[y * out_stride..(y + 1) * out_stride], width);
            },
        );
        if !ok {
            return Err(PngError::Filter);
        }
    } else {
        for pass in &passes {
            let seg = &mut raw[pass.offset..pass.offset + pass.stride * pass.height as usize];
            if !defilter::defilter_in_place(seg, pass.stride - 1, pass.height as usize, bpp) {
                return Err(PngError::Filter);
            }
        }
        for pass in &passes {
            scatter_pass(pass, &raw, &mut out, out_stride, &expander);
        }
    }

    Ok(Image {
        data: out,
        width: ihdr.width,
        height: ihdr.height,
    })
}

/// Expand one Adam7 pass and scatter its pixels into the full-size output.
/// Scanlines within a pass map to distinct output rows.
fn scatter_pass(
    pass: &Pass,
    raw: &[u8],
    out: &mut [u8],
    out_stride: usize,
    expander: &RowExpander,
) {
    let p = pass.index;
    let y_start = interlace::Y_START[p] as usize;
    let y_delta = interlace::Y_DELTA[p] as usize;
    let x_start = interlace::X_START[p] as usize;
    let x_delta = interlace::X_DELTA[p] as usize;
    let width = pass.width as usize;

    out.chunks_mut(out_stride)
        .enumerate()
        .filter(|(y, _)| *y >= y_start && (*y - y_start).is_multiple_of(y_delta))
        .for_each(|(y, dst)| {
            let i = (y - y_start) / y_delta;
            if i >= pass.height as usize {
                return;
            }
            let src = &raw[pass.offset + i * pass.stride + 1..pass.offset + (i + 1) * pass.stride];
            let mut row = vec![0u8; width * 4];
            expander.expand_row(src, &mut row, width);
            if x_delta == 1 {
                dst[..width * 4].copy_from_slice(&row);
            } else {
                for (k, px) in row.chunks_exact(4).enumerate() {
                    let x = x_start + k * x_delta;
                    dst[x * 4..x * 4 + 4].copy_from_slice(px);
                }
            }
        });
}

/// Non-empty passes with raw-stream offsets. Scanline widths are validated
/// against spng's u32 ceiling at IHDR time (parse_pre_idat already ran
/// check_ihdr; spng computes subimages in read_ihdr and rejects overflow
/// there, before any other chunk is read — but since both paths reject, the
/// later check point here is equivalent).
fn build_passes(ihdr: &Ihdr) -> Result<Vec<Pass>, PngError> {
    let mut passes = Vec::with_capacity(7);
    let mut offset = 0usize;
    if ihdr.interlace == 0 {
        let stride = ihdr.scanline_width(ihdr.width)?;
        passes.push(Pass {
            width: ihdr.width,
            height: ihdr.height,
            stride,
            offset: 0,
            index: usize::MAX,
        });
        return Ok(passes);
    }
    for (i, &(w, h)) in interlace::pass_dimensions(ihdr.width, ihdr.height)
        .iter()
        .enumerate()
    {
        if w == 0 || h == 0 {
            continue;
        }
        let stride = ihdr.scanline_width(w)?;
        let len = stride.checked_mul(h as usize).ok_or(PngError::Overflow)?;
        passes.push(Pass {
            width: w,
            height: h,
            stride,
            offset,
            index: i,
        });
        offset = offset.checked_add(len).ok_or(PngError::Overflow)?;
    }
    Ok(passes)
}

/// Walk the IDAT run lazily and inflate into `raw`, replicating spng's
/// "read only what the stream needs" semantics: chunks past the point where
/// the output completes are never validated, the consumed run's final chunk
/// needs its payload but not its CRC, and inner chunks need payload + CRC +
/// next header.
fn inflate_idat_into(
    data: &[u8],
    first_idat: usize,
    passes: &[Pass],
    raw: &mut [u8],
    strict: bool,
) -> Result<(), PngError> {
    // Fast path: a fully-present consecutive IDAT run whose concatenated
    // stream is complete and sized exactly — libdeflate, whole-buffer.
    if !strict {
        if let Some(zlib) = gather_idat_run(data, first_idat) {
            if backend::inflate_exact(&zlib, raw).is_some() {
                return Ok(());
            }
        }
    }

    let mut walker = IdatWalker {
        data,
        pos: first_idat,
        first: true,
        reason: PngError::IdatTooShort,
    };
    let chunks = std::iter::from_fn(|| Some(walker.next_payload()));
    let windows = GateWindows {
        passes,
        pass: 0,
        row: 0,
        first: true,
    };
    #[cfg(feature = "fuzzing")]
    let result = if strict {
        backend::strict::inflate_idat(chunks, windows, raw)
    } else {
        backend::inflate_idat(chunks, windows, raw)
    };
    #[cfg(not(feature = "fuzzing"))]
    let result = {
        debug_assert!(!strict);
        backend::inflate_idat(chunks, windows, raw)
    };
    match result {
        IdatInflate::Done => Ok(()),
        IdatInflate::TooShort => Err(PngError::IdatTooShort),
        IdatInflate::BadStream => Err(PngError::IdatStream),
        IdatInflate::NeedsInput => Err(walker.reason.clone()),
    }
}

/// spng's avail_out gate sequence: one byte for the initial filter-byte
/// read, then scanline_width per scanline (each window carries the next
/// row's filter byte), the final scanline one byte short. Classic zlib's
/// accept/reject can depend on these exact window boundaries (see
/// inflate.rs), so they must match spng to the byte.
struct GateWindows<'a> {
    passes: &'a [Pass],
    pass: usize,
    row: u32,
    first: bool,
}

impl Iterator for GateWindows<'_> {
    type Item = usize;

    fn next(&mut self) -> Option<usize> {
        if self.first {
            self.first = false;
            return Some(1);
        }
        while self.pass < self.passes.len() {
            let p = &self.passes[self.pass];
            if self.row < p.height {
                self.row += 1;
                let last = self.pass == self.passes.len() - 1 && self.row == p.height;
                return Some(p.stride - usize::from(last));
            }
            self.pass += 1;
            self.row = 0;
        }
        None
    }
}

struct IdatWalker<'a> {
    data: &'a [u8],
    /// Offset of the next chunk's length field (or of the pending CRC +
    /// header once the first chunk is consumed).
    pos: usize,
    first: bool,
    reason: PngError,
}

impl<'a> IdatWalker<'a> {
    fn next_payload(&mut self) -> Option<&'a [u8]> {
        let hdr = if self.first {
            self.first = false;
            self.pos // header already validated by the pre-IDAT walker
        } else {
            // CRC of the previous chunk (read, unverified) + next header.
            if self.pos + 12 > self.data.len() {
                self.reason = PngError::UnexpectedEof;
                return None;
            }
            self.pos + 4
        };
        let len = chunks::read_u32(self.data, hdr);
        if len > i32::MAX as u32 {
            self.reason = PngError::ChunkStdLen;
            return None;
        }
        if &self.data[hdr + 4..hdr + 8] != b"IDAT" {
            // spng: zlib stream still needs input but the IDAT run ended.
            self.reason = PngError::IdatTooShort;
            return None;
        }
        let start = hdr + 8;
        let end = start.checked_add(len as usize)?;
        if end > self.data.len() {
            self.reason = PngError::UnexpectedEof;
            return None;
        }
        self.pos = end;
        Some(&self.data[start..end])
    }
}

/// Concatenated payload of the consecutive, fully-present IDAT run starting
/// at `first_idat`. None when any chunk is truncated (the lazy path decides
/// what spng would do). Borrows the payload directly for the single-IDAT case
/// (the common screenshot shape), only allocating to join a multi-chunk run.
fn gather_idat_run(data: &[u8], first_idat: usize) -> Option<Cow<'_, [u8]>> {
    let mut parts: Vec<&[u8]> = Vec::new();
    let mut pos = first_idat;
    let mut first = true;
    loop {
        let hdr = if first { pos } else { pos + 4 };
        if hdr + 8 > data.len() {
            break;
        }
        if &data[hdr + 4..hdr + 8] != b"IDAT" {
            break;
        }
        let len = chunks::read_u32(data, hdr);
        if len > i32::MAX as u32 {
            break;
        }
        let start = hdr + 8;
        let end = start.checked_add(len as usize)?;
        if end > data.len() {
            // Truncated chunk: bail to the lazy path, which may not need it.
            if first {
                return None;
            }
            break;
        }
        parts.push(&data[start..end]);
        pos = end;
        first = false;
    }
    match parts.as_slice() {
        [] => None,
        // Single IDAT: inflate straight from the borrowed payload, no copy.
        [only] => Some(Cow::Borrowed(only)),
        many => {
            let total = many.iter().map(|p| p.len()).sum();
            let mut buf = Vec::with_capacity(total);
            for p in many {
                buf.extend_from_slice(p);
            }
            Some(Cow::Owned(buf))
        }
    }
}

fn try_alloc(len: usize) -> Result<Vec<u8>, PngError> {
    let mut v: Vec<u8> = Vec::new();
    v.try_reserve_exact(len)
        .map_err(|_| PngError::OutOfMemory)?;
    // SAFETY: u8 has no validity requirements; every byte is written before
    // being read (inflate fills `raw` fully or decode fails; the output is
    // written row by row by the expanders).
    unsafe { v.set_len(len) };
    Ok(v)
}

/// Zero-initialized allocation for the OR-scatter output (sub-byte interlaced
/// PNG/RAW), with the same fallible-reserve contract as [`try_alloc`].
fn try_alloc_zeroed(len: usize) -> Result<Vec<u8>, PngError> {
    let mut v: Vec<u8> = Vec::new();
    v.try_reserve_exact(len)
        .map_err(|_| PngError::OutOfMemory)?;
    v.resize(len, 0);
    Ok(v)
}
