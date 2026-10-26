//! Scanline defiltering: in-place, sequential, SIMD-friendly per-row kernels.
//!
//! `raw` holds `height` rows of `1 + width_bytes` (leading filter byte per
//! row). All filter bytes are validated (<= 4) up front so [`defilter_row`]'s
//! match stays total.

/// Paeth predictor in stb_image's threshold form: `a` (the loop-carried left
/// byte) feeds only an add, a min/max and two selects, a shorter chain than the
/// spec's three absolute differences (~20-25% faster defilter on Paeth rows).
/// The selects compile to csel/cmov, so nothing mispredicts on photo residuals.
/// Byte-identical to the spec predictor over all inputs (`paeth_matches_spec`).
#[inline(always)]
fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let (a, b, c) = (a as i32, b as i32, c as i32);
    let thresh = 3 * c - (a + b);
    let lo = a.min(b);
    let hi = a.max(b);
    let t0 = if hi <= thresh { lo } else { c };
    let t1 = if thresh <= lo { hi } else { t0 };
    t1 as u8
}

/// Defilter one row given the previous defiltered row (`prev` empty for the
/// first row of a segment). Const BPP keeps the per-channel carry in
/// registers and lets the channels form independent dependency chains.
#[inline(always)]
fn defilter_row<const BPP: usize>(filter: u8, row: &mut [u8], prev: &[u8]) {
    // Row length is always a whole number of filter units: sub-byte depths
    // use BPP=1, and 8/16-bit rows are width * channels * (depth/8) bytes.
    debug_assert_eq!(row.len() % BPP, 0);
    match filter {
        0 => {}
        1 => {
            let mut a = [0u8; BPP];
            for px in row.chunks_exact_mut(BPP) {
                for i in 0..BPP {
                    a[i] = px[i].wrapping_add(a[i]);
                    px[i] = a[i];
                }
            }
        }
        2 => {
            if !prev.is_empty() {
                for (r, &p) in row.iter_mut().zip(prev) {
                    *r = r.wrapping_add(p);
                }
            }
        }
        3 => {
            let mut a = [0u8; BPP];
            if prev.is_empty() {
                for px in row.chunks_exact_mut(BPP) {
                    for i in 0..BPP {
                        a[i] = px[i].wrapping_add(a[i] >> 1);
                        px[i] = a[i];
                    }
                }
            } else {
                avg_row::<BPP>(row, prev);
            }
        }
        4 => {
            let mut a = [0u8; BPP];
            if prev.is_empty() {
                // paeth(left, 0, 0) == left
                for px in row.chunks_exact_mut(BPP) {
                    for i in 0..BPP {
                        a[i] = px[i].wrapping_add(a[i]);
                        px[i] = a[i];
                    }
                }
            } else {
                let mut c = [0u8; BPP];
                for (px, pb) in row.chunks_exact_mut(BPP).zip(prev.chunks_exact(BPP)) {
                    for i in 0..BPP {
                        a[i] = px[i].wrapping_add(paeth(a[i], pb[i], c[i]));
                        c[i] = pb[i];
                        px[i] = a[i];
                    }
                }
            }
        }
        _ => unreachable!("filter validated by defilter_in_place_bpp"),
    }
}

/// Avg against a previous row. 4- and 8-byte pixels take the NEON kernel on
/// aarch64 (1.25x and 1.8x on Avg rows); NEON Sub and Paeth measured no faster.
#[inline(always)]
fn avg_row<const BPP: usize>(row: &mut [u8], prev: &[u8]) {
    #[cfg(target_arch = "aarch64")]
    if BPP == 4 || BPP == 8 {
        neon::avg_row::<BPP>(row, prev);
        return;
    }
    let mut a = [0u8; BPP];
    for (px, pb) in row.chunks_exact_mut(BPP).zip(prev.chunks_exact(BPP)) {
        for i in 0..BPP {
            let avg = ((a[i] as u16 + pb[i] as u16) >> 1) as u8;
            a[i] = px[i].wrapping_add(avg);
            px[i] = a[i];
        }
    }
}

#[cfg(target_arch = "aarch64")]
mod neon {
    use core::arch::aarch64::*;

    /// One pixel per 8-lane register: `vhadd` is the truncating `(a + b) >> 1`
    /// without widening. Pixels load straight into vector registers (a detour
    /// through general registers cost half the win). BPP must be 4 or 8.
    #[inline(always)]
    pub fn avg_row<const BPP: usize>(row: &mut [u8], prev: &[u8]) {
        // SAFETY: NEON is part of the aarch64 baseline. Every access covers
        // exactly one BPP-byte pixel of `row` or `prev`, read unaligned.
        unsafe {
            let mut a = vdup_n_u8(0);
            for (px, pb) in row.chunks_exact_mut(BPP).zip(prev.chunks_exact(BPP)) {
                if BPP == 8 {
                    let x = vld1_u8(px.as_ptr());
                    let b = vld1_u8(pb.as_ptr());
                    a = vadd_u8(x, vhadd_u8(a, b));
                    vst1_u8(px.as_mut_ptr(), a);
                } else {
                    let load = |p: *const u8| {
                        vreinterpret_u8_u32(vdup_n_u32(p.cast::<u32>().read_unaligned()))
                    };
                    a = vadd_u8(load(px.as_ptr()), vhadd_u8(a, load(pb.as_ptr())));
                    let out = vget_lane_u32::<0>(vreinterpret_u32_u8(a));
                    px.as_mut_ptr().cast::<u32>().write_unaligned(out);
                }
            }
        }
    }
}

fn defilter_rows<const BPP: usize>(seg: &mut [u8], stride: usize, rows: usize) {
    for y in 0..rows {
        let (done, rest) = seg.split_at_mut(y * stride);
        let filter = rest[0];
        let row = &mut rest[1..stride];
        let prev = if y == 0 {
            &[][..]
        } else {
            &done[(y - 1) * stride + 1..y * stride]
        };
        defilter_row::<BPP>(filter, row, prev);
    }
}

/// Defilter every row in place, invoking `sink(y, defiltered_row)` immediately
/// after each row is reconstructed — while it's still hot in cache. The caller
/// uses this to expand the row into the output in the same pass, so the raw
/// buffer is never re-streamed from memory for a separate expand sweep.
fn defilter_rows_cb<const BPP: usize>(
    seg: &mut [u8],
    stride: usize,
    rows: usize,
    mut sink: impl FnMut(usize, &[u8]),
) {
    for y in 0..rows {
        let (done, rest) = seg.split_at_mut(y * stride);
        let filter = rest[0];
        let row = &mut rest[1..stride];
        let prev = if y == 0 {
            &[][..]
        } else {
            &done[(y - 1) * stride + 1..y * stride]
        };
        defilter_row::<BPP>(filter, row, prev);
        sink(y, row);
    }
}

/// Like [`defilter_in_place`] but fused with expansion: each row is handed to
/// `sink` right after it's defiltered (see [`defilter_rows_cb`]). Returns false
/// on a filter byte > 4, before calling `sink` for that row.
pub fn defilter_in_place_expand(
    raw: &mut [u8],
    width_bytes: usize,
    height: usize,
    bpp: usize,
    sink: impl FnMut(usize, &[u8]),
) -> bool {
    let stride = 1 + width_bytes;
    debug_assert_eq!(raw.len(), stride * height);
    for y in 0..height {
        if raw[y * stride] > 4 {
            return false;
        }
    }
    match bpp {
        1 => defilter_rows_cb::<1>(raw, stride, height, sink),
        2 => defilter_rows_cb::<2>(raw, stride, height, sink),
        3 => defilter_rows_cb::<3>(raw, stride, height, sink),
        4 => defilter_rows_cb::<4>(raw, stride, height, sink),
        6 => defilter_rows_cb::<6>(raw, stride, height, sink),
        8 => defilter_rows_cb::<8>(raw, stride, height, sink),
        _ => unreachable!("PNG bpp is 1,2,3,4,6,8"),
    }
    true
}

/// Defilter all rows in place, sequentially. Returns false on a filter byte
/// > 4 (callers map to PngError::Filter).
pub fn defilter_in_place(raw: &mut [u8], width_bytes: usize, height: usize, bpp: usize) -> bool {
    match bpp {
        1 => defilter_in_place_bpp::<1>(raw, width_bytes, height),
        2 => defilter_in_place_bpp::<2>(raw, width_bytes, height),
        3 => defilter_in_place_bpp::<3>(raw, width_bytes, height),
        4 => defilter_in_place_bpp::<4>(raw, width_bytes, height),
        6 => defilter_in_place_bpp::<6>(raw, width_bytes, height),
        8 => defilter_in_place_bpp::<8>(raw, width_bytes, height),
        _ => unreachable!("PNG bpp is 1,2,3,4,6,8"),
    }
}

fn defilter_in_place_bpp<const BPP: usize>(
    raw: &mut [u8],
    width_bytes: usize,
    height: usize,
) -> bool {
    let stride = 1 + width_bytes;
    debug_assert_eq!(raw.len(), stride * height);
    // Validate filter bytes up front so defilter_row's match stays total.
    for y in 0..height {
        if raw[y * stride] > 4 {
            return false;
        }
    }
    defilter_rows::<BPP>(raw, stride, height);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Paeth predictor exactly as written in the PNG spec.
    fn paeth_spec(a: u8, b: u8, c: u8) -> u8 {
        let p = a as i32 + b as i32 - c as i32;
        let (pa, pb, pc) = (
            (p - a as i32).abs(),
            (p - b as i32).abs(),
            (p - c as i32).abs(),
        );
        if pa <= pb && pa <= pc {
            a
        } else if pb <= pc {
            b
        } else {
            c
        }
    }

    #[test]
    fn paeth_matches_spec() {
        for a in 0..=255u8 {
            for b in 0..=255u8 {
                for c in 0..=255u8 {
                    assert_eq!(paeth(a, b, c), paeth_spec(a, b, c), "a={a} b={b} c={c}");
                }
            }
        }
    }

    /// Reference defilter straight from the PNG spec.
    fn defilter_reference(raw: &[u8], width_bytes: usize, height: usize, bpp: usize) -> Vec<u8> {
        let stride = 1 + width_bytes;
        let mut out = raw.to_vec();
        for y in 0..height {
            let filter = out[y * stride];
            for i in 0..width_bytes {
                let pos = y * stride + 1 + i;
                let a = if i >= bpp { out[pos - bpp] } else { 0 };
                let b = if y > 0 { out[pos - stride] } else { 0 };
                let c = if y > 0 && i >= bpp {
                    out[pos - stride - bpp]
                } else {
                    0
                };
                out[pos] = match filter {
                    0 => out[pos],
                    1 => out[pos].wrapping_add(a),
                    2 => out[pos].wrapping_add(b),
                    3 => out[pos].wrapping_add(((a as u16 + b as u16) / 2) as u8),
                    4 => out[pos].wrapping_add(paeth_spec(a, b, c)),
                    _ => unreachable!(),
                };
            }
        }
        out
    }

    fn lcg_bytes(n: usize, mut seed: u32) -> Vec<u8> {
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            v.push((seed >> 24) as u8);
        }
        v
    }

    #[test]
    fn matches_reference_for_all_bpp_and_filters() {
        for bpp in [1usize, 2, 3, 4, 6, 8] {
            for width_px in [1usize, 2, 7, 33] {
                let width_bytes = width_px * bpp;
                let height = 13;
                let stride = 1 + width_bytes;
                let mut raw = lcg_bytes(stride * height, bpp as u32 * 31 + width_px as u32);
                for y in 0..height {
                    raw[y * stride] = ((y * 7 + bpp) % 5) as u8; // mix of all filters
                }
                let expected = defilter_reference(&raw, width_bytes, height, bpp);
                let mut got = raw.clone();
                assert!(defilter_in_place(&mut got, width_bytes, height, bpp));
                assert_eq!(got, expected, "bpp={} width_px={}", bpp, width_px);
            }
        }
    }

    #[test]
    fn rejects_bad_filter_byte() {
        let mut raw = vec![5u8, 0, 0, 0];
        assert!(!defilter_in_place(&mut raw, 3, 1, 3));
    }

    /// The fused defilter+expand driver must reconstruct exactly what the plain
    /// in-place defilter does, and hand each row to the sink once in order.
    #[test]
    fn expand_cb_matches_in_place() {
        for bpp in [1usize, 2, 3, 4, 6, 8] {
            for width_px in [1usize, 2, 7, 33] {
                let width_bytes = width_px * bpp;
                let height = 11;
                let stride = 1 + width_bytes;
                let mut raw = lcg_bytes(stride * height, bpp as u32 * 17 + width_px as u32);
                for y in 0..height {
                    raw[y * stride] = ((y * 7 + bpp) % 5) as u8;
                }

                let mut reference = raw.clone();
                assert!(defilter_in_place(&mut reference, width_bytes, height, bpp));

                let mut fused = raw.clone();
                let mut seen = Vec::new();
                assert!(defilter_in_place_expand(
                    &mut fused,
                    width_bytes,
                    height,
                    bpp,
                    |y, row| {
                        seen.push(y);
                        let want = &reference[y * stride + 1..(y + 1) * stride];
                        assert_eq!(row, want, "bpp={bpp} width_px={width_px} y={y}");
                    }
                ));
                assert_eq!(seen, (0..height).collect::<Vec<_>>());
            }
        }
    }
}
