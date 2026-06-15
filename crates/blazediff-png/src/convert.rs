//! General defiltered-scanline → output-format conversion, byte-exact to
//! libspng's `spng_decode_scanline` pipeline for every `SPNG_FMT_*` and
//! decode flag.
//!
//! The conversion mirrors spng step for step: a base decode loop, then (in
//! spng's order) `trns_row` → `scale_row` → `gamma_correct_row`. 16-bit
//! samples are read as host values; output 16-bit formats are written
//! host-endian (`Png`, `Rgba16`, `Ga16`) and `Raw` keeps PNG big-endian.
//! tRNS key comparisons are done in PNG byte order (a consistent permutation
//! on both sides), so no host-order rewrite of the source is needed.
//!
//! The hot `Rgba8` default path is *not* routed here — it keeps the proven
//! LUT expander in [`crate::expand`]. This converter covers every other
//! format and the gamma/sBIT transforms.

use crate::chunks::{
    Ihdr, Plte, Trns, COLOR_GRAYSCALE, COLOR_GRAYSCALE_ALPHA, COLOR_INDEXED, COLOR_TRUECOLOR,
    COLOR_TRUECOLOR_ALPHA,
};
use crate::format::{DecodeFormat, DecodeOptions};
use crate::meta::Sbit;

/// MSB-first sub-byte / byte sample iterator, matching spng's `get_sample`.
pub(crate) struct SampleIter<'a> {
    samples: &'a [u8],
    pos: usize,
    shift: i32,
    initial_shift: i32,
    bit_depth: u32,
    mask: u8,
}

impl<'a> SampleIter<'a> {
    #[inline]
    pub(crate) fn new(bit_depth: u32, samples: &'a [u8]) -> Self {
        let initial_shift = 8 - bit_depth as i32;
        Self {
            samples,
            pos: 0,
            shift: initial_shift,
            initial_shift,
            bit_depth,
            mask: ((1u16 << bit_depth) - 1) as u8,
        }
    }

    #[inline]
    pub(crate) fn next_sample(&mut self) -> u8 {
        let x = (self.samples[self.pos] >> self.shift) & self.mask;
        self.shift -= self.bit_depth as i32;
        if self.shift < 0 {
            self.shift = self.initial_shift;
            self.pos += 1;
        }
        x
    }
}

/// Scale `sbits` significant bits of `sample` from `bit_depth` to `target`,
/// a direct port of spng's `sample_to_target` (left-bit-replication upscale,
/// right-shift downscale).
pub(crate) fn sample_to_target(sample: u16, bit_depth: u32, sbits: u32, target: u32) -> u16 {
    let mut sample = sample;
    if bit_depth == sbits {
        if target == sbits {
            return sample;
        }
    } else {
        sample >>= bit_depth - sbits;
    }

    if target < sbits {
        return sample >> (sbits - target);
    }

    let mut shift_amount: i32 = target as i32 - sbits as i32;
    let sample_bits = sample as u32;
    let mut acc: u32 = 0;
    while shift_amount >= 0 {
        acc |= sample_bits << shift_amount;
        shift_amount -= sbits as i32;
    }
    let partial = shift_amount + sbits as i32;
    if partial != 0 {
        acc |= sample_bits >> shift_amount.unsigned_abs();
    }
    acc as u16
}

/// Per-image conversion plan: the output format plus all precomputed
/// transform state, so `convert_row` stays branchy only on the format.
pub struct RowConverter {
    fmt: DecodeFormat,
    color_type: u8,
    bit_depth: u32,
    /// sBIT-scaled RGBA palette (indexed sources only).
    plte: Box<[[u8; 4]; 256]>,
    /// Whether to run `scale_row` after the base loop.
    do_scaling: bool,
    /// Depth passed to `scale_row`. spng's `decode_scanline` uses the *raw*
    /// `ihdr.bit_depth` (8 for indexed) here, even though the sBIT bits and
    /// the `do_scaling` decision were computed against the 8-bit-reduced
    /// `processing_depth` — so 16-bit + sBIT → RGBA8/RGB8 shifts to all-zeros,
    /// a quirk we reproduce for byte-exact parity.
    scale_depth: u32,
    sb_red: u32,
    sb_green: u32,
    sb_blue: u32,
    sb_alpha: u32,
    sb_gray: u32,
    /// Transparency post-pass (truecolor / gray-alpha) — grayscale RGBA8/16
    /// transparency is folded into the base loop instead.
    apply_trns: bool,
    gray_trns: Option<u16>,
    rgb_trns_be: Option<[u8; 6]>,
    /// 256- or 65536-entry gamma LUT (only RGBA8/RGB8/RGBA16).
    gamma_lut: Option<Box<[u16]>>,
}

impl RowConverter {
    /// Build the plan. `gama`/`sbit` come from the parsed chunks; the format
    /// must already have passed `check_decode_fmt`.
    pub fn new(
        ihdr: &Ihdr,
        plte: Option<&Plte>,
        trns: Option<&Trns>,
        gama: Option<u32>,
        sbit: Option<&Sbit>,
        opts: &DecodeOptions,
    ) -> Self {
        use DecodeFormat::*;

        let fmt = opts.format;
        let want_trns = opts.apply_trns;
        let want_gamma = opts.apply_gamma;
        let want_sbit = opts.apply_sbit;
        let color_type = ihdr.color_type;
        let bit_depth = ihdr.bit_depth as u32;
        let indexed = color_type == COLOR_INDEXED;

        // --- apply_trns gating (spng spng_decode_image) ---
        // tRNS only fires when present and requested; sources that already
        // carry alpha, and Rgb8/Png/Raw, suppress it.
        let mut apply_trns = want_trns && trns.is_some();
        if matches!(color_type, COLOR_GRAYSCALE_ALPHA | COLOR_TRUECOLOR_ALPHA) {
            apply_trns = false;
        }
        if matches!(fmt, Rgb8 | Png | Raw) {
            apply_trns = false;
        }

        // --- depth / sBIT setup ---
        let depth_target = if fmt == Rgba16 { 16 } else { 8 };
        // decode_scanline's local processing depth (used by scale_row).
        let scale_depth = if indexed { 8 } else { bit_depth };
        let mut processing_depth = if indexed { 8 } else { bit_depth };

        let use_sbit = want_sbit && sbit.is_some();
        let mut sb_red = processing_depth;
        let mut sb_green = processing_depth;
        let mut sb_blue = processing_depth;
        let mut sb_alpha = processing_depth;
        let mut sb_gray = processing_depth;
        if let (true, Some(sb)) = (use_sbit, sbit) {
            match color_type {
                COLOR_GRAYSCALE => {
                    sb_gray = sb.grayscale as u32;
                    sb_alpha = bit_depth;
                }
                COLOR_TRUECOLOR | COLOR_INDEXED => {
                    sb_red = sb.red as u32;
                    sb_green = sb.green as u32;
                    sb_blue = sb.blue as u32;
                    sb_alpha = bit_depth;
                }
                COLOR_GRAYSCALE_ALPHA => {
                    sb_gray = sb.grayscale as u32;
                    sb_alpha = sb.alpha as u32;
                }
                _ => {
                    sb_red = sb.red as u32;
                    sb_green = sb.green as u32;
                    sb_blue = sb.blue as u32;
                    sb_alpha = sb.alpha as u32;
                }
            }
        }

        // 16-bit sources reduced to 8-bit in the loop scale their sBIT down.
        if bit_depth == 16 && matches!(fmt, Rgba8 | Rgb8) {
            sb_red = sb_red.saturating_sub(8);
            sb_green = sb_green.saturating_sub(8);
            sb_blue = sb_blue.saturating_sub(8);
            sb_alpha = sb_alpha.saturating_sub(8);
            sb_gray = sb_gray.saturating_sub(8);
            processing_depth = 8;
        }

        let mut do_scaling = !indexed && !matches!(fmt, Png | Raw);
        if sb_red == sb_green
            && sb_green == sb_blue
            && sb_blue == sb_alpha
            && sb_alpha == processing_depth
            && processing_depth == depth_target
        {
            do_scaling = false;
        }

        // --- palette pre-process (indexed): sBIT-scale + bake tRNS alpha ---
        let mut plte_box = Box::new([[0u8, 0, 0, 255]; 256]);
        if indexed {
            let trns_alpha: &[u8] = match trns {
                Some(Trns::Palette(a)) => a,
                _ => &[],
            };
            for (i, entry) in plte_box.iter_mut().enumerate() {
                let (mut r, mut g, mut b) = (0u8, 0u8, 0u8);
                if let Some(p) = plte {
                    let rgb = p.entries[i];
                    r = rgb[0];
                    g = rgb[1];
                    b = rgb[2];
                }
                let a = if want_trns && i < trns_alpha.len() {
                    trns_alpha[i]
                } else {
                    255
                };
                entry[0] = sample_to_target(r as u16, 8, sb_red, 8) as u8;
                entry[1] = sample_to_target(g as u16, 8, sb_green, 8) as u8;
                entry[2] = sample_to_target(b as u16, 8, sb_blue, 8) as u8;
                entry[3] = sample_to_target(a as u16, 8, sb_alpha, 8) as u8;
            }
        }

        // --- transparency keys for the post-pass / base loop ---
        let mask: u16 = if bit_depth < 16 {
            (1u16 << bit_depth) - 1
        } else {
            0xFFFF
        };
        let gray_trns = match (apply_trns, color_type, trns) {
            (true, COLOR_GRAYSCALE, Some(Trns::Gray(g))) => Some(*g),
            _ => None,
        };
        let rgb_trns_be = match (apply_trns, color_type, trns) {
            (true, COLOR_TRUECOLOR, Some(Trns::Rgb([r, g, b]))) => {
                if bit_depth == 16 {
                    let mut key = [0u8; 6];
                    key[0..2].copy_from_slice(&r.to_be_bytes());
                    key[2..4].copy_from_slice(&g.to_be_bytes());
                    key[4..6].copy_from_slice(&b.to_be_bytes());
                    Some(key)
                } else {
                    // 8-bit: masked low byte per channel (3 significant bytes).
                    Some([
                        (r & mask) as u8,
                        (g & mask) as u8,
                        (b & mask) as u8,
                        0,
                        0,
                        0,
                    ])
                }
            }
            _ => None,
        };

        // --- gamma LUT (RGBA8/RGB8 → 256 entries, RGBA16 → 65536) ---
        let gamma_lut = if want_gamma && matches!(fmt, Rgba8 | Rgb8 | Rgba16) {
            gama.map(|g| build_gamma_lut(g, fmt == Rgba16))
        } else {
            None
        };

        RowConverter {
            fmt,
            color_type,
            bit_depth,
            plte: plte_box,
            do_scaling,
            scale_depth,
            sb_red,
            sb_green,
            sb_blue,
            sb_alpha,
            sb_gray,
            apply_trns,
            gray_trns,
            rgb_trns_be,
            gamma_lut,
        }
    }

    /// Convert one defiltered scanline (`src`, filter byte already removed) of
    /// `width` pixels into `dst`, filled with `width` output pixels.
    pub fn convert_row(&self, src: &[u8], dst: &mut [u8], width: usize) {
        self.base_loop(src, dst, width);
        if self.apply_trns {
            self.trns_row(src, dst, width);
        }
        if self.do_scaling {
            self.scale_row(dst, width);
        }
        if let Some(lut) = &self.gamma_lut {
            self.gamma_row(dst, width, lut);
        }
    }

    /// spng's base decode loop: write raw (un-scaled) samples plus inline
    /// alpha for grayscale RGBA outputs.
    fn base_loop(&self, src: &[u8], dst: &mut [u8], width: usize) {
        use DecodeFormat::*;
        match self.fmt {
            Raw => {
                let n = native_row_bytes(self.color_type, self.bit_depth, width);
                dst[..n].copy_from_slice(&src[..n]);
            }
            Png => {
                let n = native_row_bytes(self.color_type, self.bit_depth, width);
                if self.bit_depth == 16 {
                    // host-endian byteswap of each 16-bit sample
                    for (s, d) in src[..n].chunks_exact(2).zip(dst[..n].chunks_exact_mut(2)) {
                        let v = u16::from_be_bytes([s[0], s[1]]);
                        d.copy_from_slice(&v.to_ne_bytes());
                    }
                } else {
                    dst[..n].copy_from_slice(&src[..n]);
                }
            }
            G8 => self.base_g8(src, dst, width),
            Ga8 => self.base_ga8(src, dst, width),
            Ga16 => self.base_ga16(src, dst, width),
            Rgb8 => self.base_rgb_like(src, dst, width, 3),
            Rgba8 => self.base_rgb_like(src, dst, width, 4),
            Rgba16 => self.base_rgba16(src, dst, width),
        }
    }

    /// G8: grayscale source, depth <= 8. Same-layout copy at depth 8, unpack
    /// otherwise; scaling (if any) happens in `scale_row`.
    fn base_g8(&self, src: &[u8], dst: &mut [u8], width: usize) {
        if self.bit_depth == 8 {
            dst[..width].copy_from_slice(&src[..width]);
        } else {
            let mut iter = SampleIter::new(self.bit_depth, src);
            for d in dst[..width].iter_mut() {
                *d = iter.next_sample();
            }
        }
    }

    /// GA8: grayscale source, depth <= 8 → (gray, 255).
    fn base_ga8(&self, src: &[u8], dst: &mut [u8], width: usize) {
        let mut iter = SampleIter::new(self.bit_depth, src);
        for d in dst[..width * 2].chunks_exact_mut(2) {
            d[0] = iter.next_sample();
            d[1] = 255;
        }
    }

    /// GA16: grayscale source, depth 16 → (gray_host, 65535).
    fn base_ga16(&self, src: &[u8], dst: &mut [u8], width: usize) {
        for (s, d) in src
            .chunks_exact(2)
            .take(width)
            .zip(dst[..width * 4].chunks_exact_mut(4))
        {
            let g = u16::from_be_bytes([s[0], s[1]]);
            d[0..2].copy_from_slice(&g.to_ne_bytes());
            d[2..4].copy_from_slice(&65535u16.to_ne_bytes());
        }
    }

    /// RGB8 / RGBA8 base loop (out_channels 3 or 4).
    fn base_rgb_like(&self, src: &[u8], dst: &mut [u8], width: usize, oc: usize) {
        let has_alpha = oc == 4;
        match self.color_type {
            COLOR_INDEXED => {
                let mut iter = SampleIter::new(self.bit_depth, src);
                for d in dst[..width * oc].chunks_exact_mut(oc) {
                    let e = self.plte[iter.next_sample() as usize];
                    d[0] = e[0];
                    d[1] = e[1];
                    d[2] = e[2];
                    if has_alpha {
                        d[3] = e[3];
                    }
                }
            }
            COLOR_TRUECOLOR => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(6)
                        .take(width)
                        .zip(dst[..width * oc].chunks_exact_mut(oc))
                    {
                        d[0] = s[0];
                        d[1] = s[2];
                        d[2] = s[4];
                        if has_alpha {
                            d[3] = 255;
                        }
                    }
                } else {
                    for (s, d) in src
                        .chunks_exact(3)
                        .take(width)
                        .zip(dst[..width * oc].chunks_exact_mut(oc))
                    {
                        d[0] = s[0];
                        d[1] = s[1];
                        d[2] = s[2];
                        if has_alpha {
                            d[3] = 255;
                        }
                    }
                }
            }
            COLOR_TRUECOLOR_ALPHA => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(8)
                        .take(width)
                        .zip(dst[..width * oc].chunks_exact_mut(oc))
                    {
                        d[0] = s[0];
                        d[1] = s[2];
                        d[2] = s[4];
                        if has_alpha {
                            d[3] = s[6];
                        }
                    }
                } else {
                    for (s, d) in src
                        .chunks_exact(4)
                        .take(width)
                        .zip(dst[..width * oc].chunks_exact_mut(oc))
                    {
                        d[0] = s[0];
                        d[1] = s[1];
                        d[2] = s[2];
                        if has_alpha {
                            d[3] = s[3];
                        }
                    }
                }
            }
            COLOR_GRAYSCALE_ALPHA => {
                let (stride, a_off) = if self.bit_depth == 16 { (4, 2) } else { (2, 1) };
                for (s, d) in src
                    .chunks_exact(stride)
                    .take(width)
                    .zip(dst[..width * oc].chunks_exact_mut(oc))
                {
                    let g = s[0]; // high byte == gray_16 >> 8 at depth 16
                    d[0] = g;
                    d[1] = g;
                    d[2] = g;
                    if has_alpha {
                        d[3] = s[a_off];
                    }
                }
            }
            COLOR_GRAYSCALE => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(2)
                        .take(width)
                        .zip(dst[..width * oc].chunks_exact_mut(oc))
                    {
                        let g = s[0]; // high byte == r_16 >> 8
                        d[0] = g;
                        d[1] = g;
                        d[2] = g;
                        if has_alpha {
                            let gray16 = u16::from_be_bytes([s[0], s[1]]);
                            d[3] = if self.gray_trns == Some(gray16) {
                                0
                            } else {
                                255
                            };
                        }
                    }
                } else {
                    let mut iter = SampleIter::new(self.bit_depth, src);
                    for d in dst[..width * oc].chunks_exact_mut(oc) {
                        let g = iter.next_sample();
                        d[0] = g;
                        d[1] = g;
                        d[2] = g;
                        if has_alpha {
                            d[3] = if self.gray_trns == Some(g as u16) {
                                0
                            } else {
                                255
                            };
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// RGBA16 base loop: write host-endian 16-bit samples. 8-bit sources keep
    /// raw values here (scaled to 16 bits later by `scale_row`); indexed
    /// replicates bytes inline; grayscale applies tRNS inline.
    fn base_rgba16(&self, src: &[u8], dst: &mut [u8], width: usize) {
        let put = |d: &mut [u8], r: u16, g: u16, b: u16, a: u16| {
            d[0..2].copy_from_slice(&r.to_ne_bytes());
            d[2..4].copy_from_slice(&g.to_ne_bytes());
            d[4..6].copy_from_slice(&b.to_ne_bytes());
            d[6..8].copy_from_slice(&a.to_ne_bytes());
        };
        match self.color_type {
            COLOR_INDEXED => {
                let mut iter = SampleIter::new(self.bit_depth, src);
                for d in dst[..width * 8].chunks_exact_mut(8) {
                    let e = self.plte[iter.next_sample() as usize];
                    let rep = |v: u8| ((v as u16) << 8) | v as u16;
                    put(d, rep(e[0]), rep(e[1]), rep(e[2]), rep(e[3]));
                }
            }
            COLOR_TRUECOLOR => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(6)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        let r = u16::from_be_bytes([s[0], s[1]]);
                        let g = u16::from_be_bytes([s[2], s[3]]);
                        let b = u16::from_be_bytes([s[4], s[5]]);
                        put(d, r, g, b, 65535);
                    }
                } else {
                    for (s, d) in src
                        .chunks_exact(3)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        put(d, s[0] as u16, s[1] as u16, s[2] as u16, 255);
                    }
                }
            }
            COLOR_TRUECOLOR_ALPHA => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(8)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        let r = u16::from_be_bytes([s[0], s[1]]);
                        let g = u16::from_be_bytes([s[2], s[3]]);
                        let b = u16::from_be_bytes([s[4], s[5]]);
                        let a = u16::from_be_bytes([s[6], s[7]]);
                        put(d, r, g, b, a);
                    }
                } else {
                    for (s, d) in src
                        .chunks_exact(4)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        put(d, s[0] as u16, s[1] as u16, s[2] as u16, s[3] as u16);
                    }
                }
            }
            COLOR_GRAYSCALE_ALPHA => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(4)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        let g = u16::from_be_bytes([s[0], s[1]]);
                        let a = u16::from_be_bytes([s[2], s[3]]);
                        put(d, g, g, g, a);
                    }
                } else {
                    for (s, d) in src
                        .chunks_exact(2)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        let g = s[0] as u16;
                        put(d, g, g, g, s[1] as u16);
                    }
                }
            }
            COLOR_GRAYSCALE => {
                if self.bit_depth == 16 {
                    for (s, d) in src
                        .chunks_exact(2)
                        .take(width)
                        .zip(dst[..width * 8].chunks_exact_mut(8))
                    {
                        let g = u16::from_be_bytes([s[0], s[1]]);
                        let a = if self.gray_trns == Some(g) { 0 } else { 65535 };
                        put(d, g, g, g, a);
                    }
                } else {
                    let mut iter = SampleIter::new(self.bit_depth, src);
                    for d in dst[..width * 8].chunks_exact_mut(8) {
                        let g = iter.next_sample() as u16;
                        let a = if self.gray_trns == Some(g) { 0 } else { 255 };
                        put(d, g, g, g, a);
                    }
                }
            }
            _ => {}
        }
    }

    /// spng's `trns_row`: zero the alpha of pixels whose source matches the
    /// tRNS key. Only truecolor (RGBA8/RGBA16) and grayscale GA8/GA16 reach
    /// here; grayscale RGBA was handled inline.
    fn trns_row(&self, src: &[u8], dst: &mut [u8], width: usize) {
        use DecodeFormat::*;
        match self.fmt {
            Rgba8 if self.color_type == COLOR_TRUECOLOR => {
                let key = self.rgb_trns_be.unwrap();
                let kn = if self.bit_depth == 16 { 6 } else { 3 };
                let sn = if self.bit_depth == 16 { 6 } else { 3 };
                for (s, d) in src
                    .chunks_exact(sn)
                    .take(width)
                    .zip(dst[..width * 4].chunks_exact_mut(4))
                {
                    if s == &key[..kn] {
                        d[3] = 0;
                    }
                }
            }
            Rgba16 if self.color_type == COLOR_TRUECOLOR => {
                let key = self.rgb_trns_be.unwrap();
                let kn = if self.bit_depth == 16 { 6 } else { 3 };
                let sn = if self.bit_depth == 16 { 6 } else { 3 };
                for (s, d) in src
                    .chunks_exact(sn)
                    .take(width)
                    .zip(dst[..width * 8].chunks_exact_mut(8))
                {
                    if s == &key[..kn] {
                        d[6] = 0;
                        d[7] = 0;
                    }
                }
            }
            Ga8 => {
                // grayscale source, depth <= 8
                let key = self.gray_trns.unwrap_or(0xFFFF);
                let mut iter = SampleIter::new(self.bit_depth, src);
                for d in dst[..width * 2].chunks_exact_mut(2) {
                    if iter.next_sample() as u16 == key {
                        d[1] = 0;
                    }
                }
            }
            Ga16 => {
                // grayscale source, depth 16
                let key = self.gray_trns.unwrap_or(0xFFFF).to_be_bytes();
                for (s, d) in src
                    .chunks_exact(2)
                    .take(width)
                    .zip(dst[..width * 4].chunks_exact_mut(4))
                {
                    if s == key {
                        d[2] = 0;
                        d[3] = 0;
                    }
                }
            }
            _ => {}
        }
    }

    /// spng's `scale_row`: rescale samples to the target depth via sBIT bits.
    fn scale_row(&self, dst: &mut [u8], width: usize) {
        use DecodeFormat::*;
        let d = self.scale_depth;
        match self.fmt {
            Rgba8 => {
                for px in dst[..width * 4].chunks_exact_mut(4) {
                    px[0] = sample_to_target(px[0] as u16, d, self.sb_red, 8) as u8;
                    px[1] = sample_to_target(px[1] as u16, d, self.sb_green, 8) as u8;
                    px[2] = sample_to_target(px[2] as u16, d, self.sb_blue, 8) as u8;
                    px[3] = sample_to_target(px[3] as u16, d, self.sb_alpha, 8) as u8;
                }
            }
            Rgb8 => {
                for px in dst[..width * 3].chunks_exact_mut(3) {
                    px[0] = sample_to_target(px[0] as u16, d, self.sb_red, 8) as u8;
                    px[1] = sample_to_target(px[1] as u16, d, self.sb_green, 8) as u8;
                    px[2] = sample_to_target(px[2] as u16, d, self.sb_blue, 8) as u8;
                }
            }
            Rgba16 => {
                for px in dst[..width * 8].chunks_exact_mut(8) {
                    let r = u16::from_ne_bytes([px[0], px[1]]);
                    let g = u16::from_ne_bytes([px[2], px[3]]);
                    let b = u16::from_ne_bytes([px[4], px[5]]);
                    let a = u16::from_ne_bytes([px[6], px[7]]);
                    px[0..2]
                        .copy_from_slice(&sample_to_target(r, d, self.sb_red, 16).to_ne_bytes());
                    px[2..4]
                        .copy_from_slice(&sample_to_target(g, d, self.sb_green, 16).to_ne_bytes());
                    px[4..6]
                        .copy_from_slice(&sample_to_target(b, d, self.sb_blue, 16).to_ne_bytes());
                    px[6..8]
                        .copy_from_slice(&sample_to_target(a, d, self.sb_alpha, 16).to_ne_bytes());
                }
            }
            G8 => {
                for px in dst[..width].iter_mut() {
                    *px = sample_to_target(*px as u16, d, self.sb_gray, 8) as u8;
                }
            }
            Ga8 => {
                for px in dst[..width * 2].chunks_exact_mut(2) {
                    px[0] = sample_to_target(px[0] as u16, d, self.sb_gray, 8) as u8;
                }
            }
            // Ga16/Png/Raw: spng's scale_row has no branch — no-op.
            _ => {}
        }
    }

    /// spng's `gamma_correct_row`: map color channels (not alpha) through the
    /// gamma LUT. Only RGBA8/RGB8/RGBA16.
    fn gamma_row(&self, dst: &mut [u8], width: usize, lut: &[u16]) {
        use DecodeFormat::*;
        match self.fmt {
            Rgba8 => {
                for px in dst[..width * 4].chunks_exact_mut(4) {
                    px[0] = lut[px[0] as usize] as u8;
                    px[1] = lut[px[1] as usize] as u8;
                    px[2] = lut[px[2] as usize] as u8;
                }
            }
            Rgb8 => {
                for px in dst[..width * 3].chunks_exact_mut(3) {
                    px[0] = lut[px[0] as usize] as u8;
                    px[1] = lut[px[1] as usize] as u8;
                    px[2] = lut[px[2] as usize] as u8;
                }
            }
            Rgba16 => {
                for px in dst[..width * 8].chunks_exact_mut(8) {
                    let r = u16::from_ne_bytes([px[0], px[1]]);
                    let g = u16::from_ne_bytes([px[2], px[3]]);
                    let b = u16::from_ne_bytes([px[4], px[5]]);
                    px[0..2].copy_from_slice(&lut[r as usize].to_ne_bytes());
                    px[2..4].copy_from_slice(&lut[g as usize].to_ne_bytes());
                    px[4..6].copy_from_slice(&lut[b as usize].to_ne_bytes());
                }
            }
            _ => {}
        }
    }
}

/// Native (defiltered, filter-byte-excluded) scanline byte count for `width`
/// pixels of this color type / depth — the `Png`/`Raw` same-layout length.
fn native_row_bytes(color_type: u8, bit_depth: u32, width: usize) -> usize {
    let channels = match color_type {
        COLOR_TRUECOLOR => 3,
        COLOR_GRAYSCALE_ALPHA => 2,
        COLOR_TRUECOLOR_ALPHA => 4,
        _ => 1,
    };
    let bits = channels * bit_depth as usize * width;
    bits.div_ceil(8)
}

/// Build spng's gamma LUT: `pow(i/max, 1/(file_gamma*2.2)) * max`, computed in
/// the same float widths spng uses (f32 ratio, f64 `pow`, f32 result).
fn build_gamma_lut(gama: u32, is16: bool) -> Box<[u16]> {
    let (entries, max) = if is16 {
        (65536usize, 65535.0f32)
    } else {
        (256usize, 255.0f32)
    };
    let file_gamma = gama as f32 / 100000.0f32;
    let screen_gamma = 2.2f32;
    let exponent = 1.0f32 / (file_gamma * screen_gamma);
    let mut lut = vec![0u16; entries].into_boxed_slice();
    for (i, slot) in lut.iter_mut().enumerate() {
        let base = (i as f32 / max) as f64;
        let mut c = (base.powf(exponent as f64) * max as f64) as f32;
        if c > max {
            c = max;
        }
        *slot = c as u16;
    }
    lut
}
