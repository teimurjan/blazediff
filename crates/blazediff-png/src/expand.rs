//! Expansion of defiltered scanlines to RGBA8, byte-identical to spng's
//! `SPNG_FMT_RGBA8` + `SPNG_DECODE_TRNS` output:
//!
//! - 16-bit samples reduce to 8 bits by taking the high-order byte of the
//!   big-endian pair (spng: `r_8 = r_16 >> 8` after host byteswap).
//! - Sub-byte grayscale upscales by left bit replication
//!   (`sample_to_target(s, d, d, 8)`); palette indices are never scaled.
//! - tRNS keys compare against the *raw* sample: grayscale <= 8-bit compares
//!   the full unmasked u16 chunk value, RGB 8-bit compares the low bytes
//!   (`value & 0xFF`), and 16-bit compares exact 16-bit values.
//! - Palette entries beyond the PLTE decode as opaque black (spng
//!   pre-processes all 256 zero-initialized entries); tRNS supplies alpha
//!   for leading entries.
//!
//! Row loops are written over `chunks_exact` so the compiler can
//! autovectorize them (NEON/SSE); decode.rs drives them row by row.

use crate::chunks::{
    Ihdr, Plte, Trns, COLOR_GRAYSCALE, COLOR_GRAYSCALE_ALPHA, COLOR_INDEXED, COLOR_TRUECOLOR,
    COLOR_TRUECOLOR_ALPHA,
};

/// Left-bit-replication upscale of a `depth`-bit sample to 8 bits
/// (spng's sample_to_target with bit_depth == sbits == depth, target 8).
#[inline]
pub fn scale_to_8(sample: u8, depth: u8) -> u8 {
    match depth {
        1 => {
            if sample == 0 {
                0
            } else {
                255
            }
        }
        2 => sample * 0b0101_0101,
        4 => sample * 0b0001_0001,
        _ => sample,
    }
}

/// Per-row expansion plan, precomputed once per image so the row loops stay
/// branch-free. Covers every color type x depth combination.
pub enum RowExpander {
    /// 8-bit gray / palette via a 256-entry RGBA LUT.
    Lut8(Box<[[u8; 4]; 256]>),
    /// 1/2/4-bit gray / palette via a LUT indexed by the raw sample.
    LutPacked {
        depth: u8,
        lut: Box<[[u8; 4]; 256]>,
    },
    Gray16 {
        trns_be: Option<[u8; 2]>,
    },
    Rgb8 {
        trns: Option<[u8; 3]>,
    },
    Rgb16 {
        trns_be: Option<[u8; 6]>,
    },
    GrayAlpha8,
    GrayAlpha16,
    Rgba8,
    Rgba16,
}

impl RowExpander {
    pub fn new(ihdr: &Ihdr, plte: Option<&Plte>, trns: Option<&Trns>) -> Self {
        match (ihdr.color_type, ihdr.bit_depth) {
            (COLOR_GRAYSCALE, 16) => RowExpander::Gray16 {
                trns_be: match trns {
                    Some(Trns::Gray(g)) => Some(g.to_be_bytes()),
                    _ => None,
                },
            },
            (COLOR_GRAYSCALE, depth) => {
                let mut lut = Box::new([[0u8; 4]; 256]);
                let trns_gray = match trns {
                    Some(Trns::Gray(g)) => Some(*g),
                    _ => None,
                };
                let max = 1usize << depth.min(8);
                for (s, entry) in lut.iter_mut().enumerate().take(max) {
                    let g = scale_to_8(s as u8, depth);
                    // spng compares the raw sample against the full u16
                    // tRNS value; values above the sample range never match.
                    let a = if trns_gray == Some(s as u16) { 0 } else { 255 };
                    *entry = [g, g, g, a];
                }
                if depth == 8 {
                    RowExpander::Lut8(lut)
                } else {
                    RowExpander::LutPacked { depth, lut }
                }
            }
            (COLOR_INDEXED, depth) => {
                let mut lut = Box::new([[0u8, 0, 0, 255]; 256]);
                if let Some(plte) = plte {
                    // All 256 entries, including leftovers past n_entries
                    // from an earlier, longer duplicate PLTE — spng's LUT
                    // reads its whole fixed array.
                    for (entry, rgb) in lut.iter_mut().zip(&plte.entries) {
                        *entry = [rgb[0], rgb[1], rgb[2], 255];
                    }
                }
                if let Some(Trns::Palette(alphas)) = trns {
                    for (entry, &a) in lut.iter_mut().zip(alphas) {
                        entry[3] = a;
                    }
                }
                if depth == 8 {
                    RowExpander::Lut8(lut)
                } else {
                    RowExpander::LutPacked { depth, lut }
                }
            }
            (COLOR_TRUECOLOR, 8) => RowExpander::Rgb8 {
                trns: match trns {
                    // spng masks each u16 key with (1 << depth) - 1.
                    Some(Trns::Rgb(rgb)) => Some([rgb[0] as u8, rgb[1] as u8, rgb[2] as u8]),
                    _ => None,
                },
            },
            (COLOR_TRUECOLOR, _) => RowExpander::Rgb16 {
                trns_be: match trns {
                    Some(Trns::Rgb([r, g, b])) => {
                        let mut key = [0u8; 6];
                        key[0..2].copy_from_slice(&r.to_be_bytes());
                        key[2..4].copy_from_slice(&g.to_be_bytes());
                        key[4..6].copy_from_slice(&b.to_be_bytes());
                        Some(key)
                    }
                    _ => None,
                },
            },
            (COLOR_GRAYSCALE_ALPHA, 8) => RowExpander::GrayAlpha8,
            (COLOR_GRAYSCALE_ALPHA, _) => RowExpander::GrayAlpha16,
            (COLOR_TRUECOLOR_ALPHA, 8) => RowExpander::Rgba8,
            _ => RowExpander::Rgba16,
        }
    }

    /// Expand one defiltered scanline (without filter byte) of `width`
    /// pixels into `width * 4` RGBA bytes.
    pub fn expand_row(&self, src: &[u8], dst: &mut [u8], width: usize) {
        match self {
            RowExpander::Lut8(lut) => {
                for (s, d) in src[..width].iter().zip(dst.chunks_exact_mut(4)) {
                    d.copy_from_slice(&lut[*s as usize]);
                }
            }
            RowExpander::LutPacked { depth, lut } => {
                expand_packed(src, dst, width, *depth, lut);
            }
            RowExpander::Gray16 { trns_be } => {
                for (s, d) in src.chunks_exact(2).zip(dst.chunks_exact_mut(4)) {
                    let g = s[0];
                    let a = match trns_be {
                        Some(key) if s == key => 0,
                        _ => 255,
                    };
                    d[0] = g;
                    d[1] = g;
                    d[2] = g;
                    d[3] = a;
                }
            }
            RowExpander::Rgb8 { trns } => match trns {
                None => {
                    for (s, d) in src.chunks_exact(3).zip(dst.chunks_exact_mut(4)) {
                        d[0] = s[0];
                        d[1] = s[1];
                        d[2] = s[2];
                        d[3] = 255;
                    }
                }
                Some(key) => {
                    for (s, d) in src.chunks_exact(3).zip(dst.chunks_exact_mut(4)) {
                        d[0] = s[0];
                        d[1] = s[1];
                        d[2] = s[2];
                        d[3] = if s == key { 0 } else { 255 };
                    }
                }
            },
            RowExpander::Rgb16 { trns_be } => {
                for (s, d) in src.chunks_exact(6).zip(dst.chunks_exact_mut(4)) {
                    d[0] = s[0];
                    d[1] = s[2];
                    d[2] = s[4];
                    d[3] = match trns_be {
                        Some(key) if s == key => 0,
                        _ => 255,
                    };
                }
            }
            RowExpander::GrayAlpha8 => {
                for (s, d) in src.chunks_exact(2).zip(dst.chunks_exact_mut(4)) {
                    d[0] = s[0];
                    d[1] = s[0];
                    d[2] = s[0];
                    d[3] = s[1];
                }
            }
            RowExpander::GrayAlpha16 => {
                for (s, d) in src.chunks_exact(4).zip(dst.chunks_exact_mut(4)) {
                    d[0] = s[0];
                    d[1] = s[0];
                    d[2] = s[0];
                    d[3] = s[2];
                }
            }
            RowExpander::Rgba8 => {
                dst[..width * 4].copy_from_slice(&src[..width * 4]);
            }
            RowExpander::Rgba16 => {
                for (s, d) in src.chunks_exact(8).zip(dst.chunks_exact_mut(4)) {
                    d[0] = s[0];
                    d[1] = s[2];
                    d[2] = s[4];
                    d[3] = s[6];
                }
            }
        }
    }
}

/// Unpack `width` sub-byte samples (MSB-first within each byte, rows padded
/// to a byte boundary) through the RGBA LUT.
fn expand_packed(src: &[u8], dst: &mut [u8], width: usize, depth: u8, lut: &[[u8; 4]; 256]) {
    let per_byte = 8 / depth as usize;
    let mask = (1u16 << depth) as u8 - 1;
    let mut dst_iter = dst.chunks_exact_mut(4);
    let mut remaining = width;
    for &byte in src {
        let n = per_byte.min(remaining);
        let mut shift = 8 - depth as i32;
        for _ in 0..n {
            let sample = (byte >> shift) & mask;
            dst_iter
                .next()
                .expect("dst sized to width")
                .copy_from_slice(&lut[sample as usize]);
            shift -= depth as i32;
        }
        remaining -= n;
        if remaining == 0 {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bit_replication_matches_spng_sample_to_target() {
        // spng upscales by repeating the bit pattern.
        assert_eq!(scale_to_8(0, 1), 0);
        assert_eq!(scale_to_8(1, 1), 255);
        for s in 0..4u8 {
            assert_eq!(scale_to_8(s, 2), s * 85);
        }
        for s in 0..16u8 {
            assert_eq!(scale_to_8(s, 4), s * 17);
        }
    }

    #[test]
    fn packed_unpack_is_msb_first_with_row_padding() {
        let lut = {
            let mut l = Box::new([[0u8; 4]; 256]);
            for (i, e) in l.iter_mut().enumerate() {
                *e = [i as u8, 0, 0, 255];
            }
            l
        };
        // 1-bit, width 3: bits 1,0,1 from 0b1010_0000 (low bits are padding)
        let mut dst = vec![0u8; 12];
        expand_packed(&[0b1010_0000], &mut dst, 3, 1, &lut);
        assert_eq!([dst[0], dst[4], dst[8]], [1, 0, 1]);

        // 4-bit, width 3 spans two bytes
        let mut dst = vec![0u8; 12];
        expand_packed(&[0xAB, 0xC0], &mut dst, 3, 4, &lut);
        assert_eq!([dst[0], dst[4], dst[8]], [0xA, 0xB, 0xC]);
    }
}
