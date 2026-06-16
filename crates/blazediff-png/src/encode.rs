//! PNG encoder covering every color type / bit depth combination, with
//! optional Adam7 interlacing and real deflate levels.
//!
//! The encoder is *lossless by construction*: the requested color mode must
//! represent the RGBA8 input exactly (validated up front), so
//! `decode(encode(img)) == img` holds for every accepted combination —
//! that, plus spng cross-decoding, is the encode verification contract
//! (byte-identical output to spng is explicitly not a goal; both emit
//! valid-but-different streams).
//!
//! Single-threaded, SIMD-first: sample conversion and row filtering run
//! sequentially over rows (each row reads only its own raw bytes and the row
//! above), with the per-byte SAD / filter kernels vectorized (NEON on
//! aarch64). Level-0 output is a sequential zlib stored-block stream
//! (generalizing fast_png_io::encode_stored to any sample format).

use std::io::{self, Write};

use crate::container;
use crate::error::PngError;
use crate::interlace;
use crate::meta::{Bkgd, Location, Metadata, Text, TextKind, Trns};
use crate::{Image16, ImageRef};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorMode {
    /// Smallest lossless mode for the image content.
    Auto,
    Gray1,
    Gray2,
    Gray4,
    Gray8,
    Gray16,
    GrayAlpha8,
    GrayAlpha16,
    /// Palette with the given index depth (1/2/4/8); requires at most
    /// 2^depth unique RGBA colors.
    Indexed1,
    Indexed2,
    Indexed4,
    Indexed8,
    Rgb8,
    Rgb16,
    Rgba8,
    Rgba16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Filter {
    None,
    Sub,
    Up,
    Average,
    Paeth,
    /// Per-row minimum-sum-of-absolute-differences heuristic over all five
    /// filters.
    Adaptive,
    /// Per-row minimum-sum-of-absolute-differences heuristic restricted to a
    /// chosen subset of filters — spng's `SPNG_IMG_FILTER_CHOICE`. An empty
    /// set is rejected at encode time.
    Choice(FilterSet),
}

impl Filter {
    /// The set of filters the adaptive heuristic may pick from; the fixed
    /// variants resolve to a singleton (forced) set.
    #[inline]
    fn allowed(self) -> FilterSet {
        match self {
            Filter::None => FilterSet::NONE,
            Filter::Sub => FilterSet::SUB,
            Filter::Up => FilterSet::UP,
            Filter::Average => FilterSet::AVERAGE,
            Filter::Paeth => FilterSet::PAETH,
            Filter::Adaptive => FilterSet::ALL,
            Filter::Choice(set) => set,
        }
    }
}

/// Bitmask over the five PNG row filters the adaptive heuristic may choose
/// from, mirroring spng's `SPNG_IMG_FILTER_CHOICE`. The encoder picks the
/// lowest sum-of-absolute-differences filter *within the set* for each row; a
/// singleton set forces that filter with no scan. Compose with `|`:
///
/// ```
/// use blazediff_png::{Filter, FilterSet};
/// let up_or_paeth = Filter::Choice(FilterSet::UP | FilterSet::PAETH);
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FilterSet(u8);

impl FilterSet {
    pub const NONE: Self = Self(1 << 0);
    pub const SUB: Self = Self(1 << 1);
    pub const UP: Self = Self(1 << 2);
    pub const AVERAGE: Self = Self(1 << 3);
    pub const PAETH: Self = Self(1 << 4);
    /// All five filters — equivalent to [`Filter::Adaptive`].
    pub const ALL: Self = Self(0b1_1111);

    /// Whether the given filter type (0=None..4=Paeth) is in the set.
    #[inline]
    pub const fn contains(self, filter_type: u8) -> bool {
        self.0 & (1 << filter_type) != 0
    }

    /// The sole filter type if exactly one is set (the forced-filter fast
    /// path), else `None`.
    #[inline]
    const fn single(self) -> Option<u8> {
        if self.0.is_power_of_two() {
            Some(self.0.trailing_zeros() as u8)
        } else {
            None
        }
    }
}

impl std::ops::BitOr for FilterSet {
    type Output = Self;
    #[inline]
    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

/// PNG encode tuning. Mirrors the knobs spng exposes via `spng_set_option`
/// that the libdeflate backend can honor:
/// - `compression` ↔ `SPNG_IMG_COMPRESSION_LEVEL`,
/// - `filter` ↔ `SPNG_IMG_FILTER_CHOICE` (via [`Filter::Choice`]).
///
/// spng's `SPNG_IMG_WINDOW_BITS`, `SPNG_IMG_MEM_LEVEL`, and
/// `SPNG_IMG_COMPRESSION_STRATEGY` have **no libdeflate equivalent** —
/// libdeflate always uses a full 32 KiB window and chooses its own internal
/// memory/strategy per level — so they are intentionally not exposed rather
/// than silently accepted and ignored.
#[derive(Debug, Clone)]
pub struct EncodeOptions {
    pub color: ColorMode,
    /// 0 = uncompressed stored blocks, 1..=12 = libdeflate level.
    pub compression: u8,
    pub filter: Filter,
    pub interlace: bool,
}

impl Default for EncodeOptions {
    fn default() -> Self {
        Self {
            color: ColorMode::Auto,
            // Level 4 is the libdeflate speed/size knee for this codec: ~39%
            // faster to encode than level 6 for only ~2% larger output (levels
            // 5→6 cost ~30% more time to shave ~1.4% size). Callers wanting the
            // last sliver of ratio can still request 6..=12 explicitly.
            compression: 4,
            filter: Filter::Adaptive,
            interlace: false,
        }
    }
}

struct Mode {
    color_type: u8,
    bit_depth: u8,
    /// Palette in first-seen order + per-entry alpha (indexed only).
    palette: Option<(Vec<[u8; 3]>, Vec<u8>)>,
    /// RGBA -> palette index, for lookup-based conversion (indexed only) —
    /// used by the interlaced and explicit-palette paths where the row-major
    /// `indices` buffer doesn't apply.
    palette_index: Option<ColorMap>,
    /// Per-pixel palette index in row-major order (indexed only), recorded by
    /// the palette scan so the non-interlaced hot path skips the per-pixel map
    /// lookup entirely. `None` for non-indexed modes and whenever an explicit
    /// palette overrode the scanned first-seen order.
    indices: Option<Vec<u8>>,
}

impl Mode {
    fn new(color_type: u8, bit_depth: u8, palette: Option<(Vec<[u8; 3]>, Vec<u8>)>) -> Self {
        let palette_index = palette
            .as_ref()
            .map(|(rgb, alpha)| ColorMap::from_palette(rgb, alpha));
        Self {
            color_type,
            bit_depth,
            palette,
            palette_index,
            indices: None,
        }
    }

    /// Indexed mode from a palette scan: carries the scanned color map (for the
    /// lookup path) and the row-major per-pixel indices (for the fast path).
    fn indexed(bit_depth: u8, scan: Scan) -> Self {
        let palette = palette_from_map(&scan.map);
        Self {
            color_type: 3,
            bit_depth,
            palette: Some(palette),
            palette_index: Some(scan.map),
            indices: Some(scan.indices),
        }
    }
}

// ---------------------------------------------------------------------------
// Fast RGBA -> palette-index map
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Default)]
struct Slot {
    key: u32,
    index: u8,
    occupied: bool,
}

/// Open-addressing RGBA -> palette-index map for the indexed encode path.
/// Keyed on packed big-endian RGBA `u32`; the palette is at most 256 entries,
/// so a 512-slot table keeps the load factor <= 0.5 and probe chains short.
/// Pixel data is trusted, so a non-cryptographic multiply hash replaces std's
/// SipHash — no DoS resistance is needed and the 4-byte key hashes in one op.
struct ColorMap {
    slots: Box<[Slot]>,
    len: u16,
}

impl ColorMap {
    const BITS: u32 = 9;
    const SLOTS: usize = 1 << Self::BITS; // 512
    const MASK: usize = Self::SLOTS - 1;

    fn new() -> Self {
        Self {
            slots: vec![Slot::default(); Self::SLOTS].into_boxed_slice(),
            len: 0,
        }
    }

    /// Fibonacci hash: the top `BITS` bits of a multiply mix the whole key.
    #[inline]
    fn slot_for(key: u32) -> usize {
        (key.wrapping_mul(0x9E37_79B1) >> (32 - Self::BITS)) as usize
    }

    /// Index for `key`, inserting it with the next first-seen index when
    /// absent. Returns `None` once `max` distinct colors are already present
    /// and `key` is new (the caller aborts the palette).
    #[inline]
    fn get_or_insert(&mut self, key: u32, max: usize) -> Option<u8> {
        let mut s = Self::slot_for(key);
        loop {
            if !self.slots[s].occupied {
                if self.len as usize >= max {
                    return None;
                }
                let index = self.len as u8;
                self.slots[s] = Slot {
                    key,
                    index,
                    occupied: true,
                };
                self.len += 1;
                return Some(index);
            }
            if self.slots[s].key == key {
                return Some(self.slots[s].index);
            }
            s = (s + 1) & Self::MASK;
        }
    }

    /// Build the map from an explicit palette, binding each color to its
    /// palette position. Duplicate colors keep the last position (matching the
    /// prior `HashMap::collect` semantics).
    fn from_palette(rgb: &[[u8; 3]], alpha: &[u8]) -> Self {
        let mut map = Self::new();
        for (i, (c, &a)) in rgb.iter().zip(alpha).enumerate() {
            let key = u32::from_be_bytes([c[0], c[1], c[2], a]);
            let mut s = Self::slot_for(key);
            loop {
                if !map.slots[s].occupied {
                    map.slots[s] = Slot {
                        key,
                        index: i as u8,
                        occupied: true,
                    };
                    map.len += 1;
                    break;
                }
                if map.slots[s].key == key {
                    map.slots[s].index = i as u8;
                    break;
                }
                s = (s + 1) & Self::MASK;
            }
        }
        map
    }

    #[inline]
    fn get(&self, key: u32) -> Option<u8> {
        let mut s = Self::slot_for(key);
        loop {
            if !self.slots[s].occupied {
                return None;
            }
            if self.slots[s].key == key {
                return Some(self.slots[s].index);
            }
            s = (s + 1) & Self::MASK;
        }
    }
}

/// Result of a single palette scan over the RGBA pixels.
struct Scan {
    /// Whether every pixel is opaque (needed for the rgb/rgba fallback).
    opaque: bool,
    /// Whether the image stayed within the palette size limit.
    palette_ok: bool,
    /// First-seen color -> index map (valid only when `palette_ok`).
    map: ColorMap,
    /// Per-pixel index in row-major order (valid only when `palette_ok`).
    indices: Vec<u8>,
}

/// Single pass over the RGBA pixels building the first-seen palette and each
/// pixel's index, while tracking opacity for the fallback decision. The
/// palette aborts the moment a `max`+1-th distinct color appears, but opacity
/// keeps accumulating so the fallback mode needs no re-scan.
fn scan_pixels(data: &[u8], max: usize) -> Scan {
    let mut opaque = true;
    let mut map = ColorMap::new();
    let mut indices = Vec::new();
    let mut palette_ok = true;
    for p in data.chunks_exact(4) {
        opaque &= p[3] == 255;
        if palette_ok {
            match map.get_or_insert(u32::from_be_bytes([p[0], p[1], p[2], p[3]]), max) {
                Some(index) => indices.push(index),
                None => {
                    palette_ok = false;
                    indices = Vec::new();
                }
            }
        }
    }
    Scan {
        opaque,
        palette_ok,
        map,
        indices,
    }
}

/// Reconstruct the first-seen palette (RGB + per-entry alpha) from a scan map.
fn palette_from_map(map: &ColorMap) -> (Vec<[u8; 3]>, Vec<u8>) {
    let n = map.len as usize;
    let mut rgb = vec![[0u8; 3]; n];
    let mut alpha = vec![255u8; n];
    for slot in map.slots.iter().filter(|s| s.occupied) {
        let b = slot.key.to_be_bytes();
        rgb[slot.index as usize] = [b[0], b[1], b[2]];
        alpha[slot.index as usize] = b[3];
    }
    (rgb, alpha)
}

/// Validate the backend-honored option fields shared by both encoders.
/// (`FilterSet` is non-empty by construction — only singletons and unions are
/// expressible — so the filter set needs no runtime check.)
fn validate_options(options: &EncodeOptions) -> Result<(), PngError> {
    if options.compression > 12 {
        return Err(PngError::InvalidOptions("compression level must be 0..=12"));
    }
    Ok(())
}

pub fn encode(
    image: ImageRef,
    options: &EncodeOptions,
    meta: &Metadata,
) -> Result<Vec<u8>, PngError> {
    validate_image(image)?;
    validate_options(options)?;

    if stored_rgba8_applies(options, meta) {
        // The stored stream's size is analytic, so reserve once and let the
        // direct writer fill the output Vec in a single pass.
        let mut out = Vec::with_capacity(stored_rgba8_png_len(image));
        if write_stored_rgba8(image, &mut out)? {
            return Ok(out);
        }
    }
    encode_core(image, options, meta)
}

/// Stream the encode into `out`. The stored RGBA8 hot path writes directly to
/// the sink (peak memory ~= input); every other mode materializes the PNG and
/// writes it through.
pub fn encode_to<W: Write>(
    image: ImageRef,
    options: &EncodeOptions,
    meta: &Metadata,
    out: &mut W,
) -> Result<(), PngError> {
    validate_image(image)?;
    validate_options(options)?;

    if stored_rgba8_applies(options, meta) && write_stored_rgba8(image, out)? {
        return Ok(());
    }
    let bytes = encode_core(image, options, meta)?;
    out.write_all(&bytes)?;
    Ok(())
}

/// The generic encode: color-mode resolution, sample conversion, filtering,
/// compression, and chunk assembly. The fallback for everything the direct
/// stored path does not handle.
fn encode_core(
    image: ImageRef,
    options: &EncodeOptions,
    meta: &Metadata,
) -> Result<Vec<u8>, PngError> {
    let mode = resolve_mode(image, options.color)?;
    let mode = apply_explicit_palette(image, mode, meta)?;
    let raw = build_raw_stream(image, &mode, options)?;
    let zlib = compress(&raw, options.compression);

    Ok(assemble_png(
        image.width,
        image.height,
        &mode,
        options,
        meta,
        &zlib,
    ))
}

fn validate_image(image: ImageRef) -> Result<(), PngError> {
    if image.width == 0 || image.height == 0 {
        return Err(PngError::InvalidOptions("image dimensions must be nonzero"));
    }
    // Checked: a wrapping product could spuriously equal `data.len()` and let an
    // overflowing image through as "valid" (or panic in debug builds).
    let expected = rgba_byte_len(image.width, image.height)
        .ok_or(PngError::InvalidOptions("image dimensions overflow usize"))?;
    if image.data.len() != expected {
        return Err(PngError::InvalidOptions(
            "data length != width * height * 4",
        ));
    }
    Ok(())
}

/// `width * height * 4` (the RGBA8/RGBA16 sample-byte count), or `None` when the
/// product overflows `usize`.
#[inline]
fn rgba_byte_len(width: u32, height: u32) -> Option<usize> {
    (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4))
}

// ---------------------------------------------------------------------------
// Direct stored RGBA8 fast path (the BlazeDiff diff-write hot path)
// ---------------------------------------------------------------------------

/// Whether the options + metadata select the direct stored RGBA8 writer:
/// explicit `Rgba8`, no filtering, level 0 (stored), non-interlaced, and no
/// ancillary chunks to interleave. `Auto` is excluded so it never triggers a
/// second palette scan — callers wanting this path request `Rgba8` explicitly.
#[inline]
fn stored_rgba8_applies(options: &EncodeOptions, meta: &Metadata) -> bool {
    options.color == ColorMode::Rgba8
        && options.filter == Filter::None
        && options.compression == 0
        && !options.interlace
        && *meta == Metadata::default()
}

/// Byte length of the stored zlib stream wrapping `raw_len` logical bytes:
/// 2-byte zlib header + a 5-byte header per 0xffff block + payload + 4-byte
/// adler32 trailer. Matches [`stored_zlib`]'s layout exactly.
#[inline]
fn stored_zlib_len(raw_len: usize) -> usize {
    const BLOCK: usize = 0xffff;
    let n_blocks = raw_len.div_ceil(BLOCK).max(1);
    2 + n_blocks * 5 + raw_len + 4
}

/// Logical deflate-stream length for the stored RGBA8 encode: one filter byte
/// plus `width * 4` pixel bytes per row. `None` on `usize` overflow.
#[inline]
fn stored_raw_len(image: ImageRef) -> Option<usize> {
    let stride = (image.width as usize).checked_mul(4)?.checked_add(1)?;
    (image.height as usize).checked_mul(stride)
}

/// Total PNG size of the direct stored RGBA8 encode (signature + IHDR + single
/// IDAT + IEND), used to size the output `Vec` in one shot. A best-effort
/// capacity hint, so overflow collapses to 0 and lets the `Vec` grow naturally;
/// [`write_stored_rgba8`] is the path that actually rejects overflow.
fn stored_rgba8_png_len(image: ImageRef) -> usize {
    let Some(raw_len) = stored_raw_len(image) else {
        return 0;
    };
    // sig(8) + IHDR(12+13) + IDAT(12 + zlib) + IEND(12)
    8 + 25 + 12 + stored_zlib_len(raw_len) + 12
}

/// Write a complete stored RGBA8 PNG straight into `out` from the borrowed
/// rows — no intermediate raw or zlib buffer. The logical deflate stream is
/// `[0u8] ++ row` per row (filter byte + pixels); stored blocks re-chunk it to
/// 0xffff bytes independent of row boundaries, with adler32 over the logical
/// stream and the IDAT CRC framed incrementally. The output is byte-identical
/// to the generic level-0 RGBA8 encoder.
///
/// Returns `Ok(false)` without writing when the IDAT payload would exceed the
/// PNG 2 GB chunk limit, so the caller falls back to the generic (IDAT-
/// splitting) path.
fn write_stored_rgba8<W: Write>(image: ImageRef, out: &mut W) -> io::Result<bool> {
    const BLOCK: usize = 0xffff;
    let row_len = image.width as usize * 4;
    let stride = 1 + row_len; // filter byte + pixel bytes
    let Some(raw_len) = stored_raw_len(image) else {
        return Ok(false); // dimensions overflow usize; fall back to the generic path
    };
    let zlib_len = stored_zlib_len(raw_len);
    if zlib_len > i32::MAX as usize {
        return Ok(false);
    }

    container::write_signature(out)?;
    let mut ihdr = [0u8; 13];
    ihdr[0..4].copy_from_slice(&image.width.to_be_bytes());
    ihdr[4..8].copy_from_slice(&image.height.to_be_bytes());
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA (truecolor + alpha)
                 // ihdr[10..13] (compression / filter / interlace methods) stay 0.
    container::write_chunk(out, b"IHDR", &ihdr)?;

    let mut idat = container::IdatStreamer::new(out, zlib_len as u32)?;
    idat.write(&[0x78, 0x01])?; // zlib header

    let mut adler = simd_adler32::Adler32::new();
    let mut produced = 0usize; // logical bytes emitted so far
    let mut row = 0usize; // current source row
    let mut col = 0usize; // 0 => filter byte pending, else (col-1) into row bytes
    while produced < raw_len {
        let n = (raw_len - produced).min(BLOCK);
        let final_block = produced + n == raw_len;
        let mut hdr = [0u8; 5];
        hdr[0] = final_block as u8;
        hdr[1..3].copy_from_slice(&(n as u16).to_le_bytes());
        hdr[3..5].copy_from_slice(&(!(n as u16)).to_le_bytes());
        idat.write(&hdr)?;

        let mut left = n;
        while left > 0 {
            if col == 0 {
                idat.write(&[0u8])?; // filter byte
                adler.write(&[0u8]);
                col = 1;
                left -= 1;
            } else {
                let in_row = col - 1;
                let take = (row_len - in_row).min(left);
                let base = row * row_len + in_row;
                let seg = &image.data[base..base + take];
                idat.write(seg)?;
                adler.write(seg);
                left -= take;
                col += take;
                if col == stride {
                    col = 0;
                    row += 1;
                }
            }
        }
        produced += n;
    }

    idat.write(&adler.finish().to_be_bytes())?;
    idat.finish()?;
    container::write_chunk(out, b"IEND", &[])?;
    Ok(true)
}

/// Encode a true 16-bit RGBA image (host-order `u16` samples). Unlike
/// [`encode`], the 16-bit color modes carry the full 16-bit precision instead
/// of byte-replicating an 8-bit source; `decode_with(.., Rgba16)` round-trips
/// exactly. Only the 16-bit modes (`Gray16`/`GrayAlpha16`/`Rgb16`/`Rgba16`)
/// and `Auto` are valid — request [`encode`] for narrower output.
pub fn encode16(
    image: &Image16,
    options: &EncodeOptions,
    meta: &Metadata,
) -> Result<Vec<u8>, PngError> {
    if image.width == 0 || image.height == 0 {
        return Err(PngError::InvalidOptions("image dimensions must be nonzero"));
    }
    let expected = rgba_byte_len(image.width, image.height)
        .ok_or(PngError::InvalidOptions("image dimensions overflow usize"))?;
    if image.data.len() != expected {
        return Err(PngError::InvalidOptions(
            "data length != width * height * 4",
        ));
    }
    validate_options(options)?;

    let mode = resolve_mode16(image, options.color)?;
    let raw = build_raw_stream16(image, &mode, options);
    let zlib = compress(&raw, options.compression);

    Ok(assemble_png(
        image.width,
        image.height,
        &mode,
        options,
        meta,
        &zlib,
    ))
}

/// Replace an indexed mode's auto-derived palette with the caller's explicit
/// one (the `spng_set_plte` / `spng_set_trns` path), preserving entry order
/// and any unused trailing entries. Validates that every pixel maps and that
/// the palette fits the bit depth. A no-op for non-indexed modes or when no
/// explicit palette is given.
fn apply_explicit_palette(image: ImageRef, mode: Mode, meta: &Metadata) -> Result<Mode, PngError> {
    let Some(palette) = &meta.palette else {
        return Ok(mode);
    };
    if mode.color_type != 3 {
        return Ok(mode);
    }
    let n = palette.entries.len();
    if n == 0 || n > 256 || n > (1usize << mode.bit_depth) {
        return Err(PngError::InvalidOptions(
            "explicit palette size exceeds bit depth",
        ));
    }
    let alpha: Vec<u8> = match &meta.transparency {
        Some(Trns::Palette(a)) => (0..n).map(|i| a.get(i).copied().unwrap_or(255)).collect(),
        _ => vec![255; n],
    };
    let new = Mode::new(3, mode.bit_depth, Some((palette.entries.clone(), alpha)));
    let index = new.palette_index.as_ref().unwrap();
    for p in image.data.chunks_exact(4) {
        if index
            .get(u32::from_be_bytes([p[0], p[1], p[2], p[3]]))
            .is_none()
        {
            return Err(PngError::Unrepresentable(
                "pixel color not present in explicit palette",
            ));
        }
    }
    Ok(new)
}

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/// Scaled-value representability per gray depth: 1 -> {0,255}, 2 -> k*85,
/// 4 -> k*17 (left-bit-replication inverses).
#[inline]
fn gray_depth_ok(v: u8, depth: u8) -> bool {
    match depth {
        1 => v == 0 || v == 255,
        2 => v.is_multiple_of(85),
        4 => v.is_multiple_of(17),
        _ => true,
    }
}

fn resolve_mode(image: ImageRef, color: ColorMode) -> Result<Mode, PngError> {
    use ColorMode::*;
    let px = image.data.chunks_exact(4);

    let mode = match color {
        Auto => {
            // Gray detection short-circuits at the first colored pixel, so the
            // common (color) path pays only a cheap probe before the palette
            // scan; gray-opaque images skip the palette build entirely.
            let gray = image
                .data
                .chunks_exact(4)
                .all(|p| p[0] == p[1] && p[1] == p[2]);
            if gray && image.data.chunks_exact(4).all(|p| p[3] == 255) {
                let depth = [1u8, 2, 4]
                    .into_iter()
                    .find(|&d| image.data.chunks_exact(4).all(|p| gray_depth_ok(p[0], d)))
                    .unwrap_or(8);
                return resolve_mode(
                    image,
                    match depth {
                        1 => Gray1,
                        2 => Gray2,
                        4 => Gray4,
                        _ => Gray8,
                    },
                );
            }
            // Color, or gray-with-alpha: prefer a palette (preferred over
            // gray-alpha even when gray), then fall back by opacity.
            let scan = scan_pixels(image.data, 256);
            if scan.palette_ok {
                let depth = match scan.map.len {
                    0..=2 => 1,
                    3..=4 => 2,
                    5..=16 => 4,
                    _ => 8,
                };
                return Ok(Mode::indexed(depth, scan));
            }
            if gray {
                return resolve_mode(image, GrayAlpha8);
            }
            if scan.opaque {
                return resolve_mode(image, Rgb8);
            }
            return resolve_mode(image, Rgba8);
        }
        Gray1 | Gray2 | Gray4 | Gray8 | Gray16 => {
            let depth = match color {
                Gray1 => 1,
                Gray2 => 2,
                Gray4 => 4,
                Gray8 => 8,
                _ => 16,
            };
            for p in px {
                if p[0] != p[1] || p[1] != p[2] {
                    return Err(PngError::Unrepresentable("grayscale requires r == g == b"));
                }
                if p[3] != 255 {
                    return Err(PngError::Unrepresentable("grayscale requires opaque alpha"));
                }
                if !gray_depth_ok(p[0], depth) {
                    return Err(PngError::Unrepresentable(
                        "gray value not representable at this bit depth",
                    ));
                }
            }
            Mode::new(0, depth, None)
        }
        GrayAlpha8 | GrayAlpha16 => {
            for p in px {
                if p[0] != p[1] || p[1] != p[2] {
                    return Err(PngError::Unrepresentable("grayscale requires r == g == b"));
                }
            }
            Mode::new(4, if color == GrayAlpha8 { 8 } else { 16 }, None)
        }
        Indexed1 | Indexed2 | Indexed4 | Indexed8 => {
            let depth = match color {
                Indexed1 => 1,
                Indexed2 => 2,
                Indexed4 => 4,
                _ => 8,
            };
            let scan = scan_pixels(image.data, 1 << depth);
            if !scan.palette_ok {
                return Err(PngError::Unrepresentable(
                    "too many unique colors for the palette depth",
                ));
            }
            Mode::indexed(depth, scan)
        }
        Rgb8 | Rgb16 => {
            for p in px {
                if p[3] != 255 {
                    return Err(PngError::Unrepresentable("RGB requires opaque alpha"));
                }
            }
            Mode::new(2, if color == Rgb8 { 8 } else { 16 }, None)
        }
        Rgba8 => Mode::new(6, 8, None),
        Rgba16 => Mode::new(6, 16, None),
    };
    Ok(mode)
}

/// Mode resolution for a true 16-bit source. Only the 16-bit color types are
/// representable (down-conversion to 8-bit / palette belongs to [`encode`]);
/// `Auto` picks the smallest lossless one.
fn resolve_mode16(image: &Image16, color: ColorMode) -> Result<Mode, PngError> {
    use ColorMode::*;
    let px = || image.data.chunks_exact(4);
    let mode =
        match color {
            Auto => {
                let opaque = px().all(|p| p[3] == 65535);
                let gray = px().all(|p| p[0] == p[1] && p[1] == p[2]);
                match (gray, opaque) {
                    (true, true) => Mode::new(0, 16, None),
                    (true, false) => Mode::new(4, 16, None),
                    (false, true) => Mode::new(2, 16, None),
                    (false, false) => Mode::new(6, 16, None),
                }
            }
            Gray16 => {
                for p in px() {
                    if p[0] != p[1] || p[1] != p[2] {
                        return Err(PngError::Unrepresentable("grayscale requires r == g == b"));
                    }
                    if p[3] != 65535 {
                        return Err(PngError::Unrepresentable("grayscale requires opaque alpha"));
                    }
                }
                Mode::new(0, 16, None)
            }
            GrayAlpha16 => {
                for p in px() {
                    if p[0] != p[1] || p[1] != p[2] {
                        return Err(PngError::Unrepresentable("grayscale requires r == g == b"));
                    }
                }
                Mode::new(4, 16, None)
            }
            Rgb16 => {
                for p in px() {
                    if p[3] != 65535 {
                        return Err(PngError::Unrepresentable("RGB requires opaque alpha"));
                    }
                }
                Mode::new(2, 16, None)
            }
            Rgba16 => Mode::new(6, 16, None),
            _ => return Err(PngError::InvalidOptions(
                "encode16 supports only 16-bit color modes (Gray16/GrayAlpha16/Rgb16/Rgba16/Auto)",
            )),
        };
    Ok(mode)
}

// ---------------------------------------------------------------------------
// Sample conversion + filtering
// ---------------------------------------------------------------------------

fn channels(color_type: u8) -> usize {
    match color_type {
        2 => 3,
        4 => 2,
        6 => 4,
        _ => 1,
    }
}

fn filter_bpp(color_type: u8, bit_depth: u8) -> usize {
    if bit_depth < 8 {
        1
    } else {
        channels(color_type) * (bit_depth as usize / 8)
    }
}

fn row_bytes(color_type: u8, bit_depth: u8, width: usize) -> usize {
    (channels(color_type) * bit_depth as usize * width).div_ceil(8)
}

/// Convert one scanline of RGBA pixels (gathered by the caller for
/// interlaced passes) into raw samples of the target format. 8-bit values
/// widen to 16 bits by byte replication so decoding truncates back exactly.
fn convert_row(pixels: impl Iterator<Item = [u8; 4]>, mode: &Mode, out: &mut Vec<u8>) {
    match (mode.color_type, mode.bit_depth) {
        (0, 16) => {
            for p in pixels {
                out.extend_from_slice(&[p[0], p[0]]);
            }
        }
        (0, 8) => out.extend(pixels.map(|p| p[0])),
        (0, depth) => pack_bits(pixels.map(|p| p[0] >> (8 - depth)), depth, out),
        (2, 8) => {
            for p in pixels {
                out.extend_from_slice(&p[..3]);
            }
        }
        (2, _) => {
            for p in pixels {
                out.extend_from_slice(&[p[0], p[0], p[1], p[1], p[2], p[2]]);
            }
        }
        (3, depth) => {
            let index = mode
                .palette_index
                .as_ref()
                .expect("indexed mode has palette");
            let index_of = move |p: [u8; 4]| {
                index
                    .get(u32::from_be_bytes(p))
                    .expect("pixel color in palette")
            };
            if depth == 8 {
                out.extend(pixels.map(index_of));
            } else {
                pack_bits(pixels.map(index_of), depth, out);
            }
        }
        (4, 8) => {
            for p in pixels {
                out.extend_from_slice(&[p[0], p[3]]);
            }
        }
        (4, _) => {
            for p in pixels {
                out.extend_from_slice(&[p[0], p[0], p[3], p[3]]);
            }
        }
        (6, 8) => {
            for p in pixels {
                out.extend_from_slice(&p);
            }
        }
        _ => {
            for p in pixels {
                out.extend_from_slice(&[p[0], p[0], p[1], p[1], p[2], p[2], p[3], p[3]]);
            }
        }
    }
}

/// Pack sub-byte samples MSB-first, padding the final byte with zeros.
fn pack_bits(samples: impl Iterator<Item = u8>, depth: u8, out: &mut Vec<u8>) {
    let mut acc = 0u8;
    let mut filled = 0u8;
    for s in samples {
        acc |= s << (8 - depth - filled);
        filled += depth;
        if filled == 8 {
            out.push(acc);
            acc = 0;
            filled = 0;
        }
    }
    if filled > 0 {
        out.push(acc);
    }
}

/// Build the full filtered raw stream (all passes when interlaced).
fn build_raw_stream(
    image: ImageRef,
    mode: &Mode,
    options: &EncodeOptions,
) -> Result<Vec<u8>, PngError> {
    let width = image.width as usize;
    let bpp = filter_bpp(mode.color_type, mode.bit_depth);

    let passes: Vec<(usize, usize, usize)> = if options.interlace {
        interlace::pass_dimensions(image.width, image.height)
            .iter()
            .enumerate()
            .filter(|(_, &(w, h))| w > 0 && h > 0)
            .map(|(i, &(w, h))| (i, w as usize, h as usize))
            .collect()
    } else {
        vec![(usize::MAX, width, image.height as usize)]
    };

    let mut out = Vec::new();
    for &(pass, pw, ph) in &passes {
        let rb = row_bytes(mode.color_type, mode.bit_depth, pw);

        // RGBA8 in == RGBA8 out: the samples are exactly `image.data`, so
        // filter straight from it — no full-image raw copy at all.
        if pass == usize::MAX && mode.color_type == 6 && mode.bit_depth == 8 {
            filter_pass(&mut out, image.data, rb, ph, bpp, options);
            continue;
        }

        // Raw (unfiltered) pass samples, appended row by row straight into the
        // pass buffer — no per-row temp allocation or intermediate copy, and
        // the non-interlaced hot path skips the `dyn` pixel iterator.
        let mut raw = Vec::with_capacity(rb * ph);
        if pass == usize::MAX {
            if let Some(indices) = mode.indices.as_ref() {
                // Indexed, non-interlaced: the scan already computed each
                // pixel's index in row-major order, so emit it without any
                // per-pixel map lookup.
                if mode.bit_depth == 8 {
                    raw.extend_from_slice(indices);
                } else {
                    for i in 0..ph {
                        pack_bits(
                            indices[i * width..(i + 1) * width].iter().copied(),
                            mode.bit_depth,
                            &mut raw,
                        );
                    }
                }
            } else {
                for i in 0..ph {
                    let base = i * width * 4;
                    let pixels = image.data[base..base + width * 4]
                        .chunks_exact(4)
                        .map(|p| [p[0], p[1], p[2], p[3]]);
                    convert_row(pixels, mode, &mut raw);
                }
            }
        } else {
            let y_start = interlace::Y_START[pass] as usize;
            let y_delta = interlace::Y_DELTA[pass] as usize;
            let x0 = interlace::X_START[pass] as usize;
            let dx = interlace::X_DELTA[pass] as usize;
            for i in 0..ph {
                let y = y_start + i * y_delta;
                let pixels = (0..pw).map(move |k| {
                    let base = (y * width + x0 + k * dx) * 4;
                    let p = &image.data[base..base + 4];
                    [p[0], p[1], p[2], p[3]]
                });
                convert_row(pixels, mode, &mut raw);
            }
        }
        debug_assert_eq!(raw.len(), rb * ph);

        filter_pass(&mut out, &raw, rb, ph, bpp, options);
    }
    Ok(out)
}

/// Filter one pass's raw samples into the output stream (filter byte + payload
/// per row): row y depends only on raw rows y and y-1. Shared by the 8-bit
/// ([`build_raw_stream`]) and 16-bit ([`build_raw_stream16`]) encoders.
fn filter_pass(
    out: &mut Vec<u8>,
    raw: &[u8],
    rb: usize,
    ph: usize,
    bpp: usize,
    options: &EncodeOptions,
) {
    let set = options.filter.allowed();
    let base = out.len();
    // Each output byte (filter tag + every filtered payload byte) is written
    // below, so grow without the zero-fill `resize` would do.
    let added = (1 + rb) * ph;
    out.reserve(added);
    // SAFETY: u8 needs no init; the chunks_mut loop writes all `added` bytes
    // (dst[0] = filter, apply_filter fills dst[1..]) before anyone reads them.
    #[allow(clippy::uninit_vec)]
    unsafe {
        out.set_len(base + added)
    };
    out[base..]
        .chunks_mut(1 + rb)
        .enumerate()
        .for_each(|(y, dst)| {
            let row = &raw[y * rb..(y + 1) * rb];
            let prev = if y == 0 {
                &[][..]
            } else {
                &raw[(y - 1) * rb..y * rb]
            };
            let filter = best_filter(set, row, prev, bpp);
            dst[0] = filter;
            apply_filter(filter, row, prev, bpp, &mut dst[1..]);
        });
}

/// Convert one scanline of RGBA16 pixels into big-endian samples of the
/// target 16-bit format (the only formats `resolve_mode16` produces).
fn convert_row16(pixels: impl Iterator<Item = [u16; 4]>, color_type: u8, out: &mut Vec<u8>) {
    match color_type {
        0 => {
            for p in pixels {
                out.extend_from_slice(&p[0].to_be_bytes());
            }
        }
        2 => {
            for p in pixels {
                out.extend_from_slice(&p[0].to_be_bytes());
                out.extend_from_slice(&p[1].to_be_bytes());
                out.extend_from_slice(&p[2].to_be_bytes());
            }
        }
        4 => {
            for p in pixels {
                out.extend_from_slice(&p[0].to_be_bytes());
                out.extend_from_slice(&p[3].to_be_bytes());
            }
        }
        _ => {
            for p in pixels {
                for c in p {
                    out.extend_from_slice(&c.to_be_bytes());
                }
            }
        }
    }
}

/// 16-bit analogue of [`build_raw_stream`]: gather `u16` pixels (per pass when
/// interlaced), convert to big-endian samples, and filter via the shared
/// [`filter_pass`].
fn build_raw_stream16(image: &Image16, mode: &Mode, options: &EncodeOptions) -> Vec<u8> {
    let width = image.width as usize;
    let bpp = filter_bpp(mode.color_type, mode.bit_depth);

    let passes: Vec<(usize, usize, usize)> = if options.interlace {
        interlace::pass_dimensions(image.width, image.height)
            .iter()
            .enumerate()
            .filter(|(_, &(w, h))| w > 0 && h > 0)
            .map(|(i, &(w, h))| (i, w as usize, h as usize))
            .collect()
    } else {
        vec![(usize::MAX, width, image.height as usize)]
    };

    let mut out = Vec::new();
    for &(pass, pw, ph) in &passes {
        let rb = row_bytes(mode.color_type, mode.bit_depth, pw);

        let mut raw = Vec::with_capacity(rb * ph);
        if pass == usize::MAX {
            for i in 0..ph {
                let base = i * width * 4;
                let pixels = image.data[base..base + width * 4]
                    .chunks_exact(4)
                    .map(|p| [p[0], p[1], p[2], p[3]]);
                convert_row16(pixels, mode.color_type, &mut raw);
            }
        } else {
            let y_start = interlace::Y_START[pass] as usize;
            let y_delta = interlace::Y_DELTA[pass] as usize;
            let x0 = interlace::X_START[pass] as usize;
            let dx = interlace::X_DELTA[pass] as usize;
            for i in 0..ph {
                let y = y_start + i * y_delta;
                let pixels = (0..pw).map(move |k| {
                    let base = (y * width + x0 + k * dx) * 4;
                    let p = &image.data[base..base + 4];
                    [p[0], p[1], p[2], p[3]]
                });
                convert_row16(pixels, mode.color_type, &mut raw);
            }
        }
        debug_assert_eq!(raw.len(), rb * ph);

        filter_pass(&mut out, &raw, rb, ph, bpp, options);
    }
    out
}

#[inline(always)]
fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let (ia, ib, ic) = (a as i16, b as i16, c as i16);
    let pa = (ib - ic).abs();
    let pb = (ia - ic).abs();
    let pc = (ia + ib - 2 * ic).abs();
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

#[inline]
fn filtered_byte(filter: u8, x: u8, a: u8, b: u8, c: u8) -> u8 {
    match filter {
        0 => x,
        1 => x.wrapping_sub(a),
        2 => x.wrapping_sub(b),
        3 => x.wrapping_sub(((a as u16 + b as u16) >> 1) as u8),
        _ => x.wrapping_sub(paeth(a, b, c)),
    }
}

/// Minimum-sum-of-absolute-differences heuristic (libpng's): each filtered
/// byte contributes min(v, 256 - v); the filter with the smallest sum wins,
/// earliest on ties. Only filters in `set` are considered; a singleton set is
/// the forced-filter fast path (no scan).
///
/// Filtering is the bulk of a level-0 (stored) encode — ~74% — so the per-byte
/// SAD is the encoder hot path; on aarch64 it runs the NEON kernel in
/// [`neon::filter_sad`] (the signed-abs + widening reduction the autovectorizer
/// leaves on the table — measured ~1.3x; see `benches/simd_kernels.rs`), scalar
/// elsewhere. Both produce byte-identical filter choices.
fn best_filter(set: FilterSet, row: &[u8], prev: &[u8], bpp: usize) -> u8 {
    if let Some(only) = set.single() {
        return only;
    }
    let mut best = 0u8;
    let mut best_sum = u64::MAX;
    for filter in 0..=4u8 {
        if !set.contains(filter) {
            continue;
        }
        let sum = filter_sad(filter, row, prev, bpp, best_sum);
        if sum < best_sum {
            best_sum = sum;
            best = filter;
        }
    }
    best
}

/// Sum of min(v, 256-v) over the `filter`-filtered row, aborting once the
/// running sum reaches `limit` (the current best — any larger sum can't win).
#[inline]
fn filter_sad(filter: u8, row: &[u8], prev: &[u8], bpp: usize, limit: u64) -> u64 {
    #[cfg(target_arch = "aarch64")]
    {
        neon::filter_sad(filter, row, prev, bpp, limit)
    }
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        wasm_simd::filter_sad(filter, row, prev, bpp, limit)
    }
    #[cfg(not(any(
        target_arch = "aarch64",
        all(target_arch = "wasm32", target_feature = "simd128")
    )))]
    {
        filter_sad_scalar(filter, row, prev, bpp, limit)
    }
}

/// Scalar SAD reference — the parity twin the NEON kernel is checked against
/// (see the `neon_matches_scalar` test) and the path on non-aarch64 targets.
fn filter_sad_scalar(filter: u8, row: &[u8], prev: &[u8], bpp: usize, limit: u64) -> u64 {
    let mut sum = 0u64;
    for i in 0..row.len() {
        let a = if i >= bpp { row[i - bpp] } else { 0 };
        let b = prev.get(i).copied().unwrap_or(0);
        let c = if i >= bpp {
            prev.get(i - bpp).copied().unwrap_or(0)
        } else {
            0
        };
        let v = filtered_byte(filter, row[i], a, b, c);
        sum += (v as i8).unsigned_abs() as u64;
        if sum >= limit {
            break;
        }
    }
    sum
}

fn apply_filter(filter: u8, row: &[u8], prev: &[u8], bpp: usize, out: &mut [u8]) {
    // None — and Up on the first row — are plain copies; everything else is the
    // per-byte filter, NEON-accelerated on aarch64 (same kernel as the SAD).
    if filter == 0 || (filter == 2 && prev.is_empty()) {
        out.copy_from_slice(row);
        return;
    }
    #[cfg(target_arch = "aarch64")]
    {
        neon::apply_filter(filter, row, prev, bpp, out);
    }
    #[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
    {
        wasm_simd::apply_filter(filter, row, prev, bpp, out);
    }
    #[cfg(not(any(
        target_arch = "aarch64",
        all(target_arch = "wasm32", target_feature = "simd128")
    )))]
    apply_filter_scalar(filter, row, prev, bpp, out);
}

/// Scalar apply reference — parity twin for the NEON kernel (also the NEON
/// head pass) and the non-aarch64 path.
fn apply_filter_scalar(filter: u8, row: &[u8], prev: &[u8], bpp: usize, out: &mut [u8]) {
    for i in 0..row.len() {
        let a = if i >= bpp { row[i - bpp] } else { 0 };
        let b = prev.get(i).copied().unwrap_or(0);
        let c = if i >= bpp {
            prev.get(i - bpp).copied().unwrap_or(0)
        } else {
            0
        };
        out[i] = filtered_byte(filter, row[i], a, b, c);
    }
}

/// NEON encode-filter kernels (aarch64). Encode filtering reads only *raw*
/// neighbor bytes (`a = row[i-bpp]`, `b = prev[i]`, `c = prev[i-bpp]`) with no
/// per-pixel recurrence, so the whole row is data-parallel. Every kernel has
/// the scalar twin above as its parity reference; `neon_matches_scalar`
/// fuzz-checks equality over random rows and all `bpp`, and the encoder's
/// spng cross-decode round-trip is the end-to-end tripwire.
#[cfg(target_arch = "aarch64")]
mod neon {
    use core::arch::aarch64::*;

    /// Filtered-byte vector for a 16-lane chunk: `x - predictor(filter)`.
    /// `a/b/c` are the raw neighbor vectors. SAFETY: NEON is aarch64 baseline.
    #[inline(always)]
    unsafe fn filt_chunk(
        filter: u8,
        x: uint8x16_t,
        a: uint8x16_t,
        b: uint8x16_t,
        c: uint8x16_t,
    ) -> uint8x16_t {
        match filter {
            // None: identity. `best_filter` scans filter 0 too, so the kernel
            // must return the raw byte here rather than falling through to
            // Paeth (which would compute the wrong SAD for the None row).
            0 => x,
            1 => vsubq_u8(x, a),
            2 => vsubq_u8(x, b),
            // Average: floor((a+b)/2) is exactly the unsigned halving add.
            3 => vsubq_u8(x, vhaddq_u8(a, b)),
            _ => vsubq_u8(x, paeth_vec(a, b, c)),
        }
    }

    /// Paeth predictor over 16 lanes, computed in widened s16 (low/high halves)
    /// to match the scalar predictor exactly, including its tie-breaking.
    #[inline(always)]
    unsafe fn paeth_vec(a: uint8x16_t, b: uint8x16_t, c: uint8x16_t) -> uint8x16_t {
        let lo = paeth_half(vget_low_u8(a), vget_low_u8(b), vget_low_u8(c));
        let hi = paeth_half(vget_high_u8(a), vget_high_u8(b), vget_high_u8(c));
        vcombine_u8(lo, hi)
    }

    #[inline(always)]
    unsafe fn paeth_half(a8: uint8x8_t, b8: uint8x8_t, c8: uint8x8_t) -> uint8x8_t {
        let a = vreinterpretq_s16_u16(vmovl_u8(a8));
        let b = vreinterpretq_s16_u16(vmovl_u8(b8));
        let c = vreinterpretq_s16_u16(vmovl_u8(c8));
        let pa = vabsq_s16(vsubq_s16(b, c));
        let pb = vabsq_s16(vsubq_s16(a, c));
        let pc = vabsq_s16(vsubq_s16(vaddq_s16(a, b), vaddq_s16(c, c)));
        // pred = (pa<=pb && pa<=pc) ? a : (pb<=pc ? b : c) — matches scalar.
        let use_a = vandq_u16(vcleq_s16(pa, pb), vcleq_s16(pa, pc));
        let use_b = vcleq_s16(pb, pc);
        let pred = vbslq_s16(use_a, a, vbslq_s16(use_b, b, c));
        vmovn_u16(vreinterpretq_u16_s16(pred))
    }

    /// Load the four raw neighbor vectors for the chunk at `i` (`i >= bpp`).
    /// `prev` empty (first row) zeroes `b`/`c`.
    #[inline(always)]
    unsafe fn neighbors(
        row: &[u8],
        prev: &[u8],
        bpp: usize,
        i: usize,
    ) -> (uint8x16_t, uint8x16_t, uint8x16_t, uint8x16_t) {
        let x = vld1q_u8(row.as_ptr().add(i));
        let a = vld1q_u8(row.as_ptr().add(i - bpp));
        let (b, c) = if prev.is_empty() {
            (vdupq_n_u8(0), vdupq_n_u8(0))
        } else {
            (
                vld1q_u8(prev.as_ptr().add(i)),
                vld1q_u8(prev.as_ptr().add(i - bpp)),
            )
        };
        (x, a, b, c)
    }

    pub fn filter_sad(filter: u8, row: &[u8], prev: &[u8], bpp: usize, limit: u64) -> u64 {
        let n = row.len();
        // Head (i < bpp): a = c = 0; fall back to the scalar reference.
        let head = bpp.min(n);
        let mut sum =
            super::filter_sad_scalar(filter, &row[..head], prev_head(prev, head), bpp, limit);
        if sum >= limit {
            return sum;
        }
        // SAFETY: every load below stays in-bounds — i >= bpp and i+16 <= n.
        unsafe {
            let mut acc = vdupq_n_u32(0);
            let mut i = head;
            let mut since_drain = 0u32;
            while i + 16 <= n {
                let (x, a, b, c) = neighbors(row, prev, bpp, i);
                let v = filt_chunk(filter, x, a, b, c);
                // signed-abs of the wrapping byte, widened-accumulated.
                let abs = vreinterpretq_u8_s8(vabsq_s8(vreinterpretq_s8_u8(v)));
                acc = vpadalq_u16(acc, vpaddlq_u8(abs));
                i += 16;
                // Drain to the u64 sum every 4096 chunks (64 KiB): keeps the
                // u32 lanes from overflowing on huge rows and doubles as a
                // coarse early-out, while the per-chunk loop stays branch-light.
                since_drain += 1;
                if since_drain == 4096 {
                    sum += vaddvq_u32(acc) as u64;
                    acc = vdupq_n_u32(0);
                    since_drain = 0;
                    if sum >= limit {
                        return sum;
                    }
                }
            }
            sum += vaddvq_u32(acc) as u64;
            // Tail.
            for j in i..n {
                let a = row[j - bpp];
                let b = if prev.is_empty() { 0 } else { prev[j] };
                let c = if prev.is_empty() { 0 } else { prev[j - bpp] };
                let fv = super::filtered_byte(filter, row[j], a, b, c);
                sum += (fv as i8).unsigned_abs() as u64;
                if sum >= limit {
                    break;
                }
            }
        }
        sum
    }

    pub fn apply_filter(filter: u8, row: &[u8], prev: &[u8], bpp: usize, out: &mut [u8]) {
        let n = row.len();
        let head = bpp.min(n);
        super::apply_filter_scalar(
            filter,
            &row[..head],
            prev_head(prev, head),
            bpp,
            &mut out[..head],
        );
        // SAFETY: loads/stores stay in-bounds — i >= bpp and i+16 <= n.
        unsafe {
            let mut i = head;
            while i + 16 <= n {
                let (x, a, b, c) = neighbors(row, prev, bpp, i);
                vst1q_u8(out.as_mut_ptr().add(i), filt_chunk(filter, x, a, b, c));
                i += 16;
            }
            for j in i..n {
                let a = row[j - bpp];
                let b = if prev.is_empty() { 0 } else { prev[j] };
                let c = if prev.is_empty() { 0 } else { prev[j - bpp] };
                out[j] = super::filtered_byte(filter, row[j], a, b, c);
            }
        }
    }

    /// The first `head` bytes of `prev` for the scalar head pass — empty `prev`
    /// (first row) stays empty so the scalar twin sees `b = 0`.
    #[inline]
    fn prev_head(prev: &[u8], head: usize) -> &[u8] {
        if prev.is_empty() {
            prev
        } else {
            &prev[..head]
        }
    }
}

/// wasm32 `simd128` encode-filter kernels — the structural twin of [`neon`] for
/// the wasm build, where the scalar SAD/apply is the encode hot path and LLVM's
/// autovectorizer leaves the signed-abs widening reduction on the table. Same
/// data-parallel reads (`a = row[i-bpp]`, `b = prev[i]`, `c = prev[i-bpp]`),
/// same scalar head/tail handling, byte-identical filter choices. Verified
/// against the scalar build by encoding every fixture with both at a fixed
/// level and the same deflate backend: identical filter picks ⇒ identical bytes.
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod wasm_simd {
    use core::arch::wasm32::*;

    /// Filtered-byte vector for a 16-lane chunk: `x - predictor(filter)`.
    #[inline(always)]
    fn filt_chunk(filter: u8, x: v128, a: v128, b: v128, c: v128) -> v128 {
        match filter {
            // None: identity. `best_filter` scans filter 0 too, so the kernel
            // must return the raw byte here rather than falling through to
            // Paeth (which would compute the wrong SAD for the None row).
            0 => x,
            1 => i8x16_sub(x, a),
            2 => i8x16_sub(x, b),
            // Average: floor((a+b)/2) = (a & b) + ((a ^ b) >> 1) — no widening,
            // and unlike `u8x16_avgr` (rounds up) it matches the PNG predictor.
            3 => i8x16_sub(x, i8x16_add(v128_and(a, b), u8x16_shr(v128_xor(a, b), 1))),
            _ => i8x16_sub(x, paeth_vec(a, b, c)),
        }
    }

    /// Paeth predictor over 16 lanes, computed in widened i16 (low/high halves)
    /// to match the scalar predictor exactly, including its tie-breaking. The
    /// result is `{a, b, c}` per lane (all in `0..=255`), so the final
    /// unsigned-saturating narrow never clamps.
    #[inline(always)]
    fn paeth_vec(a: v128, b: v128, c: v128) -> v128 {
        let lo = paeth_half(
            i16x8_extend_low_u8x16(a),
            i16x8_extend_low_u8x16(b),
            i16x8_extend_low_u8x16(c),
        );
        let hi = paeth_half(
            i16x8_extend_high_u8x16(a),
            i16x8_extend_high_u8x16(b),
            i16x8_extend_high_u8x16(c),
        );
        u8x16_narrow_i16x8(lo, hi)
    }

    #[inline(always)]
    fn paeth_half(a: v128, b: v128, c: v128) -> v128 {
        let pa = i16x8_abs(i16x8_sub(b, c));
        let pb = i16x8_abs(i16x8_sub(a, c));
        let pc = i16x8_abs(i16x8_sub(i16x8_add(a, b), i16x8_add(c, c)));
        // pred = (pa<=pb && pa<=pc) ? a : (pb<=pc ? b : c) — matches scalar.
        let use_a = v128_and(i16x8_le(pa, pb), i16x8_le(pa, pc));
        let use_b = i16x8_le(pb, pc);
        v128_bitselect(a, v128_bitselect(b, c, use_b), use_a)
    }

    /// Load the four raw neighbor vectors for the chunk at `i` (`i >= bpp`).
    /// `prev` empty (first row) zeroes `b`/`c`. SAFETY: caller guarantees
    /// `i >= bpp` and `i + 16 <= row.len()` (and `<= prev.len()` when non-empty).
    #[inline(always)]
    unsafe fn neighbors(row: &[u8], prev: &[u8], bpp: usize, i: usize) -> (v128, v128, v128, v128) {
        let x = v128_load(row.as_ptr().add(i) as *const v128);
        let a = v128_load(row.as_ptr().add(i - bpp) as *const v128);
        let (b, c) = if prev.is_empty() {
            (u8x16_splat(0), u8x16_splat(0))
        } else {
            (
                v128_load(prev.as_ptr().add(i) as *const v128),
                v128_load(prev.as_ptr().add(i - bpp) as *const v128),
            )
        };
        (x, a, b, c)
    }

    /// Horizontal sum of the four u32 lanes.
    #[inline(always)]
    fn hsum_u32x4(acc: v128) -> u64 {
        u32x4_extract_lane::<0>(acc) as u64
            + u32x4_extract_lane::<1>(acc) as u64
            + u32x4_extract_lane::<2>(acc) as u64
            + u32x4_extract_lane::<3>(acc) as u64
    }

    pub fn filter_sad(filter: u8, row: &[u8], prev: &[u8], bpp: usize, limit: u64) -> u64 {
        let n = row.len();
        // Head (i < bpp): a = c = 0; fall back to the scalar reference.
        let head = bpp.min(n);
        let mut sum =
            super::filter_sad_scalar(filter, &row[..head], prev_head(prev, head), bpp, limit);
        if sum >= limit {
            return sum;
        }
        // SAFETY: every load below stays in-bounds — i >= bpp and i + 16 <= n.
        unsafe {
            let mut acc = u8x16_splat(0); // u32x4 accumulator, zeroed
            let mut i = head;
            let mut since_drain = 0u32;
            while i + 16 <= n {
                let (x, a, b, c) = neighbors(row, prev, bpp, i);
                let v = filt_chunk(filter, x, a, b, c);
                // signed-abs of the wrapping byte == min(v, 256-v); abs(-128)
                // stays 0x80 == 128, matching the scalar metric.
                let abs = i8x16_abs(v);
                // Widen unsigned to i16 (lanes <= 128) and fold the two halves;
                // each summed lane <= 256, well within i16, so the signed
                // pairwise widen into u32 is exact.
                let sum16 = i16x8_add(i16x8_extend_low_u8x16(abs), i16x8_extend_high_u8x16(abs));
                acc = i32x4_add(acc, i32x4_extadd_pairwise_i16x8(sum16));
                i += 16;
                // Drain to the u64 sum every 4096 chunks: keeps the u32 lanes
                // from overflowing on huge rows and doubles as a coarse
                // early-out, mirroring the NEON kernel.
                since_drain += 1;
                if since_drain == 4096 {
                    sum += hsum_u32x4(acc);
                    acc = u8x16_splat(0);
                    since_drain = 0;
                    if sum >= limit {
                        return sum;
                    }
                }
            }
            sum += hsum_u32x4(acc);
            // Tail.
            for j in i..n {
                let a = row[j - bpp];
                let b = if prev.is_empty() { 0 } else { prev[j] };
                let c = if prev.is_empty() { 0 } else { prev[j - bpp] };
                let fv = super::filtered_byte(filter, row[j], a, b, c);
                sum += (fv as i8).unsigned_abs() as u64;
                if sum >= limit {
                    break;
                }
            }
        }
        sum
    }

    pub fn apply_filter(filter: u8, row: &[u8], prev: &[u8], bpp: usize, out: &mut [u8]) {
        let n = row.len();
        let head = bpp.min(n);
        super::apply_filter_scalar(
            filter,
            &row[..head],
            prev_head(prev, head),
            bpp,
            &mut out[..head],
        );
        // SAFETY: loads/stores stay in-bounds — i >= bpp and i + 16 <= n.
        unsafe {
            let mut i = head;
            while i + 16 <= n {
                let (x, a, b, c) = neighbors(row, prev, bpp, i);
                v128_store(
                    out.as_mut_ptr().add(i) as *mut v128,
                    filt_chunk(filter, x, a, b, c),
                );
                i += 16;
            }
            for j in i..n {
                let a = row[j - bpp];
                let b = if prev.is_empty() { 0 } else { prev[j] };
                let c = if prev.is_empty() { 0 } else { prev[j - bpp] };
                out[j] = super::filtered_byte(filter, row[j], a, b, c);
            }
        }
    }

    /// The first `head` bytes of `prev` for the scalar head pass — empty `prev`
    /// (first row) stays empty so the scalar twin sees `b = 0`.
    #[inline]
    fn prev_head(prev: &[u8], head: usize) -> &[u8] {
        if prev.is_empty() {
            prev
        } else {
            &prev[..head]
        }
    }
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

fn compress(raw: &[u8], level: u8) -> Vec<u8> {
    if level == 0 {
        // Stored (uncompressed) zlib is pure Rust and shared by every
        // backend; only real deflate levels go through the backend seam.
        return stored_zlib(raw);
    }
    crate::backend::compress(raw, level)
}

/// Zlib stream of stored (uncompressed) blocks: each 0xffff-byte block gets a
/// 5-byte header (final flag + LEN + ~LEN) followed by its payload, with the
/// adler32 of the whole stream appended — the generalization of
/// fast_png_io::encode_stored to an arbitrary byte stream. The SIMD adler32
/// runs over the contiguous input in one pass.
fn stored_zlib(raw: &[u8]) -> Vec<u8> {
    const BLOCK: usize = 0xffff;

    if raw.is_empty() {
        // Single final stored block of length 0 + adler of empty input.
        return vec![0x78, 0x01, 1, 0, 0, 0xff, 0xff, 0, 0, 0, 1];
    }

    let n_blocks = raw.len().div_ceil(BLOCK);
    let out_len = 2 + n_blocks * 5 + raw.len() + 4;
    let mut out = vec![0u8; out_len];
    out[0] = 0x78;
    out[1] = 0x01;

    let mut pos = 2;
    let mut off = 0;
    while off < raw.len() {
        let n = (raw.len() - off).min(BLOCK);
        let final_block = off + n == raw.len();
        out[pos] = final_block as u8;
        out[pos + 1..pos + 3].copy_from_slice(&(n as u16).to_le_bytes());
        out[pos + 3..pos + 5].copy_from_slice(&(!(n as u16)).to_le_bytes());
        out[pos + 5..pos + 5 + n].copy_from_slice(&raw[off..off + n]);
        pos += 5 + n;
        off += n;
    }

    let mut adler = simd_adler32::Adler32::new();
    adler.write(raw);
    out[out_len - 4..].copy_from_slice(&adler.finish().to_be_bytes());
    out
}

// ---------------------------------------------------------------------------
// Chunk assembly
// ---------------------------------------------------------------------------

/// Emit a chunk into an in-memory `Vec` via the container writer. Writing to a
/// `Vec` is infallible, so the `io::Result` is unwrapped here.
fn write_chunk(out: &mut Vec<u8>, ty: &[u8; 4], payload: &[u8]) {
    container::write_chunk(out, ty, payload).expect("Vec write is infallible");
}

fn assemble_png(
    width: u32,
    height: u32,
    mode: &Mode,
    options: &EncodeOptions,
    meta: &Metadata,
    zlib: &[u8],
) -> Vec<u8> {
    let mut out = Vec::with_capacity(zlib.len() + 256);
    container::write_signature(&mut out).expect("Vec write is infallible");

    let mut ihdr = [0u8; 13];
    ihdr[0..4].copy_from_slice(&width.to_be_bytes());
    ihdr[4..8].copy_from_slice(&height.to_be_bytes());
    ihdr[8] = mode.bit_depth;
    ihdr[9] = mode.color_type;
    ihdr[12] = options.interlace as u8;
    write_chunk(&mut out, b"IHDR", &ihdr);

    write_meta_before_plte(&mut out, mode.color_type, meta);
    write_unknown(&mut out, meta, Location::AfterIhdr);

    if let Some((rgb, alpha)) = &mode.palette {
        let plte: Vec<u8> = rgb.iter().flatten().copied().collect();
        write_chunk(&mut out, b"PLTE", &plte);
        if alpha.iter().any(|&a| a != 255) {
            let last = alpha.iter().rposition(|&a| a != 255).unwrap();
            write_chunk(&mut out, b"tRNS", &alpha[..=last]);
        }
    }

    write_meta_after_plte(&mut out, mode.color_type, meta);
    write_unknown(&mut out, meta, Location::AfterPlte);

    // 2 GB-safe IDAT splitting (chunk length must stay below 2^31).
    for part in zlib.chunks(i32::MAX as usize) {
        write_chunk(&mut out, b"IDAT", part);
    }

    write_unknown(&mut out, meta, Location::AfterIdat);
    write_chunk(&mut out, b"IEND", &[]);
    out
}

// ---------------------------------------------------------------------------
// Metadata chunk serialization
// ---------------------------------------------------------------------------

/// Color-space chunks that must precede PLTE.
fn write_meta_before_plte(out: &mut Vec<u8>, color_type: u8, meta: &Metadata) {
    if let Some(c) = &meta.chrm {
        let mut p = [0u8; 32];
        for (i, v) in [
            c.white_x, c.white_y, c.red_x, c.red_y, c.green_x, c.green_y, c.blue_x, c.blue_y,
        ]
        .iter()
        .enumerate()
        {
            p[i * 4..i * 4 + 4].copy_from_slice(&v.to_be_bytes());
        }
        write_chunk(out, b"cHRM", &p);
    }
    if let Some(g) = meta.gama {
        write_chunk(out, b"gAMA", &g.to_be_bytes());
    }
    if let Some(intent) = meta.srgb {
        write_chunk(out, b"sRGB", &[intent]);
    }
    if let Some(iccp) = &meta.iccp {
        let mut p = Vec::with_capacity(iccp.name.len() + 2 + iccp.profile.len());
        p.extend_from_slice(&iccp.name);
        p.push(0); // name terminator
        p.push(0); // compression method: zlib
        p.extend_from_slice(&compress(&iccp.profile, 6));
        write_chunk(out, b"iCCP", &p);
    }
    if let Some(s) = &meta.sbit {
        let p: &[u8] = match color_type {
            0 => &[s.grayscale],
            2 | 3 => &[s.red, s.green, s.blue],
            4 => &[s.grayscale, s.alpha],
            _ => &[s.red, s.green, s.blue, s.alpha],
        };
        write_chunk(out, b"sBIT", p);
    }
}

/// Chunks that follow PLTE (or, for non-indexed images, simply precede IDAT).
fn write_meta_after_plte(out: &mut Vec<u8>, color_type: u8, meta: &Metadata) {
    // Gray/truecolor color-key tRNS (indexed tRNS is emitted with PLTE).
    match (&meta.transparency, color_type) {
        (Some(Trns::Gray(v)), 0) => write_chunk(out, b"tRNS", &v.to_be_bytes()),
        (Some(Trns::Rgb(r, g, b)), 2) => {
            let mut p = [0u8; 6];
            p[0..2].copy_from_slice(&r.to_be_bytes());
            p[2..4].copy_from_slice(&g.to_be_bytes());
            p[4..6].copy_from_slice(&b.to_be_bytes());
            write_chunk(out, b"tRNS", &p);
        }
        _ => {}
    }
    if let Some(b) = &meta.bkgd {
        let p: Vec<u8> = match b {
            Bkgd::Gray(v) => v.to_be_bytes().to_vec(),
            Bkgd::Rgb(r, g, bl) => [r.to_be_bytes(), g.to_be_bytes(), bl.to_be_bytes()].concat(),
            Bkgd::Palette(i) => vec![*i],
        };
        write_chunk(out, b"bKGD", &p);
    }
    if let Some(h) = &meta.hist {
        let p: Vec<u8> = h.iter().flat_map(|v| v.to_be_bytes()).collect();
        write_chunk(out, b"hIST", &p);
    }
    if let Some(ph) = &meta.phys {
        let mut p = [0u8; 9];
        p[0..4].copy_from_slice(&ph.ppu_x.to_be_bytes());
        p[4..8].copy_from_slice(&ph.ppu_y.to_be_bytes());
        p[8] = ph.unit;
        write_chunk(out, b"pHYs", &p);
    }
    for s in &meta.splt {
        let mut p = Vec::with_capacity(s.name.len() + 2 + s.entries.len() * 10);
        p.extend_from_slice(&s.name);
        p.push(0);
        p.push(s.sample_depth);
        for e in &s.entries {
            if s.sample_depth == 16 {
                p.extend_from_slice(&e.red.to_be_bytes());
                p.extend_from_slice(&e.green.to_be_bytes());
                p.extend_from_slice(&e.blue.to_be_bytes());
                p.extend_from_slice(&e.alpha.to_be_bytes());
            } else {
                p.extend_from_slice(&[e.red as u8, e.green as u8, e.blue as u8, e.alpha as u8]);
            }
            p.extend_from_slice(&e.frequency.to_be_bytes());
        }
        write_chunk(out, b"sPLT", &p);
    }
    if let Some(t) = &meta.time {
        let mut p = [0u8; 7];
        p[0..2].copy_from_slice(&t.year.to_be_bytes());
        p[2..7].copy_from_slice(&[t.month, t.day, t.hour, t.minute, t.second]);
        write_chunk(out, b"tIME", &p);
    }
    if let Some(o) = &meta.offs {
        let mut p = [0u8; 9];
        p[0..4].copy_from_slice(&o.x.to_be_bytes());
        p[4..8].copy_from_slice(&o.y.to_be_bytes());
        p[8] = o.unit;
        write_chunk(out, b"oFFs", &p);
    }
    if let Some(e) = &meta.exif {
        write_chunk(out, b"eXIf", e);
    }
    for t in &meta.text {
        write_text(out, t);
    }
}

fn write_text(out: &mut Vec<u8>, t: &Text) {
    let mut p = Vec::with_capacity(t.keyword.len() + t.text.len() + 8);
    p.extend_from_slice(&t.keyword);
    p.push(0);
    match t.kind {
        TextKind::Text => p.extend_from_slice(&t.text),
        TextKind::Ztxt => {
            p.push(0); // compression method: zlib
            p.extend_from_slice(&compress(&t.text, 6));
            write_chunk(out, b"zTXt", &p);
            return;
        }
        TextKind::Itxt => {
            p.push(t.compressed as u8); // compression flag
            p.push(0); // compression method
            p.extend_from_slice(&t.language_tag);
            p.push(0);
            p.extend_from_slice(&t.translated_keyword);
            p.push(0);
            if t.compressed {
                p.extend_from_slice(&compress(&t.text, 6));
            } else {
                p.extend_from_slice(&t.text);
            }
            write_chunk(out, b"iTXt", &p);
            return;
        }
    }
    write_chunk(out, b"tEXt", &p);
}

fn write_unknown(out: &mut Vec<u8>, meta: &Metadata, at: Location) {
    for u in &meta.unknown {
        if u.location == at {
            write_chunk(out, &u.kind, &u.data);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lcg(n: usize, mut seed: u32) -> Vec<u8> {
        (0..n)
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                (seed >> 24) as u8
            })
            .collect()
    }

    /// The NEON encode-filter kernels must be byte-identical to their scalar
    /// twins for every filter, bpp, and the first-row (`prev` empty) case —
    /// the §4 parity-safety rule. Equality is checked at `limit = u64::MAX` so
    /// neither side early-aborts and the *full* SADs (which drive the filter
    /// choice) must match exactly.
    #[test]
    fn neon_matches_scalar() {
        for &bpp in &[1usize, 2, 3, 4, 6, 8] {
            // Widths around the 16-byte SIMD stride boundary, incl. < bpp.
            for &width in &[1usize, 5, 15, 16, 17, 31, 33, 257] {
                let len = width * bpp;
                let row = lcg(len, (bpp * 31 + width) as u32 + 1);
                let full_prev = lcg(len, (bpp * 17 + width) as u32 + 99);
                for prev in [&[][..], &full_prev[..]] {
                    // Filter 0 (None) included: `best_filter` scans it, so the
                    // kernel's SAD for it must match scalar too.
                    for filter in 0..=4u8 {
                        let scalar_sad = filter_sad_scalar(filter, &row, prev, bpp, u64::MAX);
                        let kernel_sad = filter_sad(filter, &row, prev, bpp, u64::MAX);
                        assert_eq!(
                            scalar_sad,
                            kernel_sad,
                            "sad mismatch filter={filter} bpp={bpp} width={width} prev_empty={}",
                            prev.is_empty()
                        );

                        let mut a = vec![0u8; len];
                        let mut b = vec![0u8; len];
                        apply_filter_scalar(filter, &row, prev, bpp, &mut a);
                        apply_filter(filter, &row, prev, bpp, &mut b);
                        assert_eq!(
                            a,
                            b,
                            "apply mismatch filter={filter} bpp={bpp} width={width} prev_empty={}",
                            prev.is_empty()
                        );
                    }
                }
            }
        }
    }
}
