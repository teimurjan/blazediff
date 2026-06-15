//! Evidence benchmark: hand-written NEON vs the autovectorized scalar code the
//! crate actually ships, for the data-parallel decode kernels (`Up` defilter
//! and truecolor-8 → RGBA8 expansion) and the Phase 6 encode-filter kernels
//! (`best_filter` SAD and Paeth `apply_filter`).
//!
//! Result on Apple Silicon (M-series), two opposite conclusions:
//!
//! **Decode kernels (`Up` defilter, RGB→RGBA expansion): scalar wins.** The
//! autovectorized scalar loops are ~1.5x / ~1.2x *faster* than explicit
//! `vld1q`/`vaddq` / `vld3q`/`vst4q`. These carry no per-pixel recurrence, so
//! the compiler already emits optimal wide code and hand-NEON only adds
//! loop/structured-load overhead — the crate keeps scalar (these benches are
//! the evidence).
//!
//! **Encode filters (`best_filter` SAD, Paeth `apply_filter`): NEON wins, and
//! is shipped.** Raw kernel throughput already favors NEON here (~1.3x on the
//! SAD, ~1.1x on Paeth): the signed-abs + widening reduction and the Paeth
//! select don't autovectorize as cleanly. In *production* the gap is far
//! larger — the scalar `best_filter`'s per-byte early-break branch defeats
//! autovectorization entirely, so it ran byte-serial; the NEON kernel
//! vectorizes with only a coarse early-out. End-to-end this cut adaptive
//! filtering from ~7.6ms to ~0.16ms on a 1100x1300 RGBA8 image (~74% of a
//! level-0 encode), so `encode.rs` dispatches to NEON on aarch64 behind a
//! scalar parity twin (`encode::tests::neon_matches_scalar`).
//!
//! Run: `cargo bench --bench simd_kernels`.

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};

const BPP: usize = 4; // RGBA8, the dominant encode case

// --- production (autovectorized scalar) variants ---

fn scalar_add_row(row: &mut [u8], prev: &[u8]) {
    for (r, &p) in row.iter_mut().zip(prev) {
        *r = r.wrapping_add(p);
    }
}

fn scalar_rgb8_to_rgba8(src: &[u8], dst: &mut [u8], width: usize) {
    for (s, d) in src
        .chunks_exact(3)
        .take(width)
        .zip(dst[..width * 4].chunks_exact_mut(4))
    {
        d[0] = s[0];
        d[1] = s[1];
        d[2] = s[2];
        d[3] = 255;
    }
}

// --- hand-written NEON variants (measured slower; not shipped) ---

#[cfg(target_arch = "aarch64")]
fn neon_add_row(row: &mut [u8], prev: &[u8]) {
    use core::arch::aarch64::*;
    // SAFETY: NEON is baseline on aarch64.
    unsafe {
        let n = row.len();
        let mut i = 0;
        while i + 16 <= n {
            let r = vld1q_u8(row.as_ptr().add(i));
            let p = vld1q_u8(prev.as_ptr().add(i));
            vst1q_u8(row.as_mut_ptr().add(i), vaddq_u8(r, p));
            i += 16;
        }
        while i < n {
            let v = (*row.get_unchecked(i)).wrapping_add(*prev.get_unchecked(i));
            *row.get_unchecked_mut(i) = v;
            i += 1;
        }
    }
}

#[cfg(target_arch = "aarch64")]
fn neon_rgb8_to_rgba8(src: &[u8], dst: &mut [u8], width: usize) {
    use core::arch::aarch64::*;
    // SAFETY: NEON is baseline on aarch64.
    unsafe {
        let alpha = vdupq_n_u8(255);
        let mut i = 0;
        while i + 16 <= width {
            let rgb = vld3q_u8(src.as_ptr().add(i * 3));
            vst4q_u8(
                dst.as_mut_ptr().add(i * 4),
                uint8x16x4_t(rgb.0, rgb.1, rgb.2, alpha),
            );
            i += 16;
        }
        while i < width {
            *dst.get_unchecked_mut(i * 4) = *src.get_unchecked(i * 3);
            *dst.get_unchecked_mut(i * 4 + 1) = *src.get_unchecked(i * 3 + 1);
            *dst.get_unchecked_mut(i * 4 + 2) = *src.get_unchecked(i * 3 + 2);
            *dst.get_unchecked_mut(i * 4 + 3) = 255;
            i += 1;
        }
    }
}

#[cfg(not(target_arch = "aarch64"))]
fn neon_add_row(row: &mut [u8], prev: &[u8]) {
    scalar_add_row(row, prev);
}

#[cfg(not(target_arch = "aarch64"))]
fn neon_rgb8_to_rgba8(src: &[u8], dst: &mut [u8], width: usize) {
    scalar_rgb8_to_rgba8(src, dst, width);
}

// --- encode-filter kernels (Phase 6) ---

#[inline(always)]
fn paeth_predict(a: u8, b: u8, c: u8) -> u8 {
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

/// `best_filter`'s per-filter cost for the `Up` filter: sum of min(v, 256-v)
/// over the filtered row (= signed-abs of the wrapping byte difference). Same
/// shape the production `best_filter` autovectorizes.
fn scalar_up_sad(row: &[u8], prev: &[u8]) -> u64 {
    let mut sum = 0u64;
    for i in 0..row.len() {
        let v = row[i].wrapping_sub(prev[i]);
        sum += (v as i8).unsigned_abs() as u64;
    }
    sum
}

/// Paeth `apply_filter` at `BPP=4`: `out[i] = row[i] - paeth(a, b, c)` over
/// raw neighbor bytes (a=row[i-bpp], b=prev[i], c=prev[i-bpp]).
fn scalar_paeth_filter(row: &[u8], prev: &[u8], out: &mut [u8]) {
    for i in 0..row.len() {
        let a = if i >= BPP { row[i - BPP] } else { 0 };
        let b = prev[i];
        let c = if i >= BPP { prev[i - BPP] } else { 0 };
        out[i] = row[i].wrapping_sub(paeth_predict(a, b, c));
    }
}

#[cfg(target_arch = "aarch64")]
fn neon_up_sad(row: &[u8], prev: &[u8]) -> u64 {
    use core::arch::aarch64::*;
    // SAFETY: NEON is baseline on aarch64.
    unsafe {
        let n = row.len();
        let mut acc = vdupq_n_u32(0);
        let mut i = 0;
        while i + 16 <= n {
            let r = vld1q_u8(row.as_ptr().add(i));
            let p = vld1q_u8(prev.as_ptr().add(i));
            // signed-abs of the wrapping difference = |(r - p) as i8|.
            let diff = vreinterpretq_s8_u8(vsubq_u8(r, p));
            let abs = vreinterpretq_u8_s8(vabsq_s8(diff));
            // widen-accumulate the byte SAD into u32 lanes.
            let pair = vpaddlq_u8(abs); // u16x8
            acc = vpadalq_u16(acc, pair); // += into u32x4
            i += 16;
        }
        let mut sum = vaddvq_u32(acc) as u64;
        while i < n {
            let v = (*row.get_unchecked(i)).wrapping_sub(*prev.get_unchecked(i));
            sum += (v as i8).unsigned_abs() as u64;
            i += 1;
        }
        sum
    }
}

#[cfg(target_arch = "aarch64")]
fn neon_paeth_filter(row: &[u8], prev: &[u8], out: &mut [u8]) {
    use core::arch::aarch64::*;
    let n = row.len();
    // First BPP bytes: a = c = 0, so paeth(0, b, 0) = b.
    let head = BPP.min(n);
    for i in 0..head {
        out[i] = row[i].wrapping_sub(prev[i]);
    }
    // SAFETY: NEON is baseline on aarch64; all loads stay in-bounds (the tail
    // below the 8-lane stride is handled scalar).
    unsafe {
        let mut i = head;
        while i + 8 <= n {
            let widen = |p: *const u8| vreinterpretq_s16_u16(vmovl_u8(vld1_u8(p)));
            let a = widen(row.as_ptr().add(i - BPP));
            let b = widen(prev.as_ptr().add(i));
            let c = widen(prev.as_ptr().add(i - BPP));
            let x = widen(row.as_ptr().add(i));

            let pa = vabsq_s16(vsubq_s16(b, c));
            let pb = vabsq_s16(vsubq_s16(a, c));
            let two_c = vaddq_s16(c, c);
            let pc = vabsq_s16(vsubq_s16(vaddq_s16(a, b), two_c));

            let use_a = vandq_u16(vcleq_s16(pa, pb), vcleq_s16(pa, pc));
            let use_b = vcleq_s16(pb, pc);
            let pred_bc = vbslq_s16(use_b, b, c);
            let pred = vbslq_s16(use_a, a, pred_bc);

            let res = vsubq_s16(x, pred);
            let bytes = vmovn_u16(vreinterpretq_u16_s16(res));
            vst1_u8(out.as_mut_ptr().add(i), bytes);
            i += 8;
        }
        while i < n {
            let a = *row.get_unchecked(i - BPP);
            let b = *prev.get_unchecked(i);
            let c = *prev.get_unchecked(i - BPP);
            *out.get_unchecked_mut(i) =
                (*row.get_unchecked(i)).wrapping_sub(paeth_predict(a, b, c));
            i += 1;
        }
    }
}

#[cfg(not(target_arch = "aarch64"))]
fn neon_up_sad(row: &[u8], prev: &[u8]) -> u64 {
    scalar_up_sad(row, prev)
}

#[cfg(not(target_arch = "aarch64"))]
fn neon_paeth_filter(row: &[u8], prev: &[u8], out: &mut [u8]) {
    scalar_paeth_filter(row, prev, out);
}

fn lcg(n: usize, mut seed: u32) -> Vec<u8> {
    (0..n)
        .map(|_| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            (seed >> 24) as u8
        })
        .collect()
}

fn bench_add_row(c: &mut Criterion) {
    let len = 1920 * 4; // one 1080p RGBA scanline
    let prev = lcg(len, 1);
    let base = lcg(len, 2);
    let mut g = c.benchmark_group("up_defilter");
    g.throughput(Throughput::Bytes(len as u64));
    g.bench_function("neon", |b| {
        let mut row = base.clone();
        b.iter(|| neon_add_row(black_box(&mut row), black_box(&prev)));
    });
    g.bench_function("scalar", |b| {
        let mut row = base.clone();
        b.iter(|| scalar_add_row(black_box(&mut row), black_box(&prev)));
    });
    g.finish();
}

fn bench_rgb8_to_rgba8(c: &mut Criterion) {
    let width = 1920;
    let src = lcg(width * 3, 3);
    let mut g = c.benchmark_group("rgb8_to_rgba8");
    g.throughput(Throughput::Bytes((width * 4) as u64));
    g.bench_function("neon", |b| {
        let mut dst = vec![0u8; width * 4];
        b.iter(|| neon_rgb8_to_rgba8(black_box(&src), black_box(&mut dst), width));
    });
    g.bench_function("scalar", |b| {
        let mut dst = vec![0u8; width * 4];
        b.iter(|| scalar_rgb8_to_rgba8(black_box(&src), black_box(&mut dst), width));
    });
    g.finish();
}

fn bench_up_sad(c: &mut Criterion) {
    let len = 1920 * 4;
    let row = lcg(len, 4);
    let prev = lcg(len, 5);
    // Correctness: NEON must equal scalar before timing means anything.
    assert_eq!(neon_up_sad(&row, &prev), scalar_up_sad(&row, &prev));
    let mut g = c.benchmark_group("best_filter_up_sad");
    g.throughput(Throughput::Bytes(len as u64));
    g.bench_function("neon", |b| {
        b.iter(|| neon_up_sad(black_box(&row), black_box(&prev)))
    });
    g.bench_function("scalar", |b| {
        b.iter(|| scalar_up_sad(black_box(&row), black_box(&prev)))
    });
    g.finish();
}

fn bench_paeth_filter(c: &mut Criterion) {
    let len = 1920 * 4;
    let row = lcg(len, 6);
    let prev = lcg(len, 7);
    let mut a = vec![0u8; len];
    let mut b_out = vec![0u8; len];
    neon_paeth_filter(&row, &prev, &mut a);
    scalar_paeth_filter(&row, &prev, &mut b_out);
    assert_eq!(a, b_out, "neon paeth must equal scalar");
    let mut g = c.benchmark_group("apply_filter_paeth");
    g.throughput(Throughput::Bytes(len as u64));
    g.bench_function("neon", |bn| {
        let mut out = vec![0u8; len];
        bn.iter(|| neon_paeth_filter(black_box(&row), black_box(&prev), black_box(&mut out)));
    });
    g.bench_function("scalar", |bn| {
        let mut out = vec![0u8; len];
        bn.iter(|| scalar_paeth_filter(black_box(&row), black_box(&prev), black_box(&mut out)));
    });
    g.finish();
}

criterion_group!(
    benches,
    bench_add_row,
    bench_rgb8_to_rgba8,
    bench_up_sad,
    bench_paeth_filter
);
criterion_main!(benches);
