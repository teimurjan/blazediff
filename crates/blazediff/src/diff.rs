//! Block-based image diff with SIMD acceleration, walked one block row at a time.
//!
//! Cold pass: a row-order SIMD scan of the band flags blocks with a pixel over the threshold.
//! Hot pass: YIQ perceptual delta with anti-aliasing detection on flagged blocks only,
//! while the band is still in cache. The other blocks get the gray background.
//!
//! SIMD: NEON (aarch64), AVX-512/AVX2/SSE4.1 (x86_64), scalar fallback (riscv64, others).

use crate::antialiasing::is_antialiased_px;
use crate::extended::diff_extended;
use crate::output::fill_gray_rect;
use crate::types::{
    Background, DiffError, DiffOptions, DiffResult, Image, ImageView, Metric, Px, Size, WindowHit,
};
use crate::yiq::threshold_to_max_delta_f32;

/// Cached CPU feature detection for x86_64
#[cfg(target_arch = "x86_64")]
#[derive(Clone, Copy)]
struct X86Features {
    has_avx2_fma: bool,
    has_sse41: bool,
}

#[cfg(target_arch = "x86_64")]
impl X86Features {
    #[inline]
    fn detect() -> Self {
        Self {
            has_avx2_fma: is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma"),
            has_sse41: is_x86_feature_detected!("sse4.1"),
        }
    }
}

const YIQ_Y_F32: [f32; 3] = [0.29889531, 0.58662247, 0.11448223];
const YIQ_I_F32: [f32; 3] = [0.59597799, -0.2741761, -0.32180189];
const YIQ_Q_F32: [f32; 3] = [0.21147017, -0.52261711, 0.31114694];
const YIQ_WEIGHTS_F32: [f32; 3] = [0.5053, 0.299, 0.1957];

#[inline]
pub(crate) fn calculate_block_size(width: u32, height: u32) -> u32 {
    let area = (width as f64) * (height as f64);
    let scale = area.sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();
    let log2_val = raw_size.log2();
    (1u32 << (log2_val.round() as u32)).clamp(8, 128)
}

// =============================================================================
// Perceptual diff detection (cold pass)
//
// Each returns the column of the first chunk (or remainder pixel) over the
// threshold, scanning rows in order. The band scan passes one row at a time,
// so the column names the block to flag.
// =============================================================================

#[cfg(target_arch = "aarch64")]
#[inline]
fn first_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    first_perceptual_diff_neon(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(target_arch = "x86_64")]
#[inline]
fn first_perceptual_diff_with_features(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    features: X86Features,
) -> Option<u32> {
    if features.has_avx2_fma {
        unsafe {
            first_perceptual_diff_avx2(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
        }
    } else if features.has_sse41 {
        unsafe {
            first_perceptual_diff_sse(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
        }
    } else {
        first_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }
}

#[cfg(target_arch = "riscv64")]
#[inline]
fn first_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    first_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
fn first_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    first_perceptual_diff_wasm(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(not(any(
    target_arch = "aarch64",
    target_arch = "x86_64",
    target_arch = "riscv64",
    all(target_arch = "wasm32", target_feature = "simd128"),
)))]
#[inline]
fn first_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    first_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

/// Minimum block-row width for the cold pass's 16-wide skip to pay off. Below
/// this the extra loop and the 8 live loads cost more than the three
/// cross-lane reduces they save. Block size is derived from image area, so in
/// practice this selects the wide path for large images (128-px blocks) and
/// leaves small ones (16/32-px blocks) on the plain 4-wide loop.
#[allow(dead_code)]
const WIDE_SKIP_MIN_ROW: usize = 64;

/// Largest eigenvalue of the YIQ metric's quadratic form, rounded up so the
/// derived bound can only ever shrink the reject window. Mirrors
/// `YIQ_LAMBDA_MAX` in `@blazediff/core`.
const YIQ_LAMBDA_MAX: f64 = 0.2560782;

/// Squared channel distance below which a pixel is provably under `max_delta`.
///
/// The bound is exact in real arithmetic; the vector kernels evaluate the
/// metric in f32, so it is shaved by 1e-5 relative to keep a pixel sitting on
/// the boundary from being rejected where the f32 metric would have counted it.
#[inline(always)]
pub(crate) fn reject_bound(max_delta: f32) -> u32 {
    ((max_delta as f64) / YIQ_LAMBDA_MAX * (1.0 - 1e-5)) as u32
}

/// Threshold test for one 4-pixel chunk that is known to contain at least one
/// differing pixel. Shared by the cold pass's wide-skip fallback and its
/// 4-wide loop so both spell the test exactly once.
#[cfg(target_arch = "aarch64")]
#[inline(always)]
unsafe fn chunk_exceeds_neon(
    a32: &[u32],
    b32: &[u32],
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
    chunk_start: usize,
    max_delta: f32,
) -> bool {
    use std::arch::aarch64::*;

    if all_opaque_neon(va, vb) {
        if within_reject_neon(va, vb, vdupq_n_u32(reject_bound(max_delta))) {
            return false;
        }

        let deltas = yiq_delta_4_neon_opaque(va, vb);
        let max_vec = vdupq_n_f32(max_delta);
        let abs_deltas = vabsq_f32(deltas);
        let exceeds = vcgtq_f32(abs_deltas, max_vec);
        return vmaxvq_u32(exceeds) != 0;
    }
    // A lane is semi-transparent: the checkerboard background depends on pixel
    // position, so fall back to the exact scalar kernel for this chunk.
    for lane in 0..4 {
        let idx = chunk_start + lane;
        let pa = a32[idx];
        let pb = b32[idx];
        if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
            return true;
        }
    }
    false
}

/// Integer reject: the YIQ metric is a positive-definite quadratic form, so
/// delta <= LAMBDA_MAX * (dr^2 + dg^2 + db^2). A chunk whose every lane is
/// within `reject` is provably below threshold and skips the float pipeline:
/// 6 int->float converts and ~9 FMAs replaced by an absolute difference and a
/// widening square-accumulate. Both vectors must be fully opaque.
#[cfg(target_arch = "aarch64")]
#[inline(always)]
unsafe fn within_reject_neon(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
    reject: std::arch::aarch64::uint32x4_t,
) -> bool {
    use std::arch::aarch64::*;

    let rgb_mask = vreinterpretq_u8_u32(vdupq_n_u32(0x00FF_FFFF));
    let d8 = vandq_u8(
        vabdq_u8(vreinterpretq_u8_u32(va), vreinterpretq_u8_u32(vb)),
        rgb_mask,
    );
    let sq_lo = vmull_u8(vget_low_u8(d8), vget_low_u8(d8));
    let sq_hi = vmull_u8(vget_high_u8(d8), vget_high_u8(d8));
    let sums = vpaddq_u32(vpaddlq_u16(sq_lo), vpaddlq_u16(sq_hi));
    vminvq_u32(vcleq_u32(sums, reject)) != 0
}

#[cfg(target_arch = "aarch64")]
#[inline]
fn first_perceptual_diff_neon(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    use std::arch::aarch64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        unsafe {
            let a_ptr = a32.as_ptr().add(row_start);
            let b_ptr = b32.as_ptr().add(row_start);

            // Wide skip: XOR four chunks, OR the results, and do a single
            // cross-lane reduce for 16 pixels instead of one per 4. The reduce
            // is a serializing dependency feeding a branch, and on the
            // dominant all-identical path its result is always "no diff".
            while offset + 16 <= row_width && row_width >= WIDE_SKIP_MIN_ROW {
                let a0 = vld1q_u32(a_ptr.add(offset));
                let b0 = vld1q_u32(b_ptr.add(offset));
                let a1 = vld1q_u32(a_ptr.add(offset + 4));
                let b1 = vld1q_u32(b_ptr.add(offset + 4));
                let a2 = vld1q_u32(a_ptr.add(offset + 8));
                let b2 = vld1q_u32(b_ptr.add(offset + 8));
                let a3 = vld1q_u32(a_ptr.add(offset + 12));
                let b3 = vld1q_u32(b_ptr.add(offset + 12));

                let acc = vorrq_u32(
                    vorrq_u32(veorq_u32(a0, b0), veorq_u32(a1, b1)),
                    vorrq_u32(veorq_u32(a2, b2), veorq_u32(a3, b3)),
                );

                if vmaxvq_u32(acc) != 0 {
                    let chunks = [(a0, b0), (a1, b1), (a2, b2), (a3, b3)];
                    for (k, (va, vb)) in chunks.into_iter().enumerate() {
                        let at = offset + 4 * k;
                        if chunk_exceeds_neon(a32, b32, va, vb, row_start + at, max_delta) {
                            return Some(start_x + at as u32);
                        }
                    }
                }
                offset += 16;
            }

            while offset + 4 <= row_width {
                let va = vld1q_u32(a_ptr.add(offset));
                let vb = vld1q_u32(b_ptr.add(offset));
                let cmp = vceqq_u32(va, vb);
                let not_cmp = vmvnq_u32(cmp);

                if vmaxvq_u32(not_cmp) != 0
                    && chunk_exceeds_neon(a32, b32, va, vb, row_start + offset, max_delta)
                {
                    return Some(start_x + offset as u32);
                }
                offset += 4;
            }
        }

        // Scalar remainder
        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
                return Some(start_x + i as u32);
            }
        }
    }
    None
}

/// SSE4.1 twin of [`chunk_exceeds_neon`], over 4 pixels.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn chunk_exceeds_sse(
    a32: &[u32],
    b32: &[u32],
    va: std::arch::x86_64::__m128i,
    vb: std::arch::x86_64::__m128i,
    chunk_start: usize,
    max_delta: f32,
) -> bool {
    use std::arch::x86_64::*;

    if all_opaque_sse(va, vb) {
        // Integer reject, see `chunk_exceeds_neon`. x86 has no byte
        // absolute-difference either, so it comes from two saturating
        // subtracts; `madd_epi16` then squares and pair-sums in one op.
        let d8 = _mm_and_si128(
            _mm_or_si128(_mm_subs_epu8(va, vb), _mm_subs_epu8(vb, va)),
            _mm_set1_epi32(0x00FF_FFFF),
        );
        let zero = _mm_setzero_si128();
        let lo = _mm_unpacklo_epi8(d8, zero);
        let hi = _mm_unpackhi_epi8(d8, zero);
        // Each madd gives (r²+g², b²+0) per pixel; hadd folds those pairs into
        // one squared channel distance per lane. Lane order does not matter,
        // the test below only asks whether *every* lane is under the bound.
        let sums = _mm_hadd_epi32(_mm_madd_epi16(lo, lo), _mm_madd_epi16(hi, hi));
        let over = _mm_cmpgt_epi32(sums, _mm_set1_epi32(reject_bound(max_delta) as i32));
        if _mm_movemask_ps(_mm_castsi128_ps(over)) == 0 {
            return false;
        }

        let deltas = yiq_delta_4_sse_opaque(va, vb);
        let max_vec = _mm_set1_ps(max_delta);
        let abs_mask = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
        let abs_deltas = _mm_and_ps(deltas, abs_mask);
        let exceeds = _mm_cmpgt_ps(abs_deltas, max_vec);
        return _mm_movemask_ps(exceeds) != 0;
    }
    // A lane is semi-transparent: the checkerboard background depends on pixel
    // position, so fall back to the exact scalar kernel for this chunk.
    for lane in 0..4 {
        let idx = chunk_start + lane;
        let pa = a32[idx];
        let pb = b32[idx];
        if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
            return true;
        }
    }
    false
}

/// AVX2 twin of [`chunk_exceeds_neon`], over 8 pixels.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
#[inline]
unsafe fn chunk_exceeds_avx2(
    a32: &[u32],
    b32: &[u32],
    va: std::arch::x86_64::__m256i,
    vb: std::arch::x86_64::__m256i,
    chunk_start: usize,
    max_delta: f32,
) -> bool {
    use std::arch::x86_64::*;

    if all_opaque_avx2(va, vb) {
        let d8 = _mm256_and_si256(
            _mm256_or_si256(_mm256_subs_epu8(va, vb), _mm256_subs_epu8(vb, va)),
            _mm256_set1_epi32(0x00FF_FFFF),
        );
        let zero = _mm256_setzero_si256();
        let lo = _mm256_unpacklo_epi8(d8, zero);
        let hi = _mm256_unpackhi_epi8(d8, zero);
        // `hadd` folds within 128-bit halves, so the 8 sums come out permuted.
        // Irrelevant here: the test is "is every lane under the bound".
        let sums = _mm256_hadd_epi32(_mm256_madd_epi16(lo, lo), _mm256_madd_epi16(hi, hi));
        let over = _mm256_cmpgt_epi32(sums, _mm256_set1_epi32(reject_bound(max_delta) as i32));
        if _mm256_movemask_ps(_mm256_castsi256_ps(over)) == 0 {
            return false;
        }

        let deltas = yiq_delta_8_avx2_opaque(va, vb);
        let max_vec = _mm256_set1_ps(max_delta);
        let abs_mask = _mm256_castsi256_ps(_mm256_set1_epi32(0x7FFFFFFF));
        let abs_deltas = _mm256_and_ps(deltas, abs_mask);
        let exceeds = _mm256_cmp_ps(abs_deltas, max_vec, _CMP_GT_OQ);
        return _mm256_movemask_ps(exceeds) != 0;
    }
    for lane in 0..8 {
        let idx = chunk_start + lane;
        let pa = a32[idx];
        let pb = b32[idx];
        if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
            return true;
        }
    }
    false
}

/// wasm twin of [`chunk_exceeds_neon`].
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline(always)]
unsafe fn chunk_exceeds_wasm(
    a32: &[u32],
    b32: &[u32],
    va: std::arch::wasm32::v128,
    vb: std::arch::wasm32::v128,
    chunk_start: usize,
    max_delta: f32,
) -> bool {
    use std::arch::wasm32::*;

    if all_opaque_wasm(va, vb) {
        if within_reject_wasm(va, vb, u32x4_splat(reject_bound(max_delta))) {
            return false;
        }

        let deltas = yiq_delta_4_wasm_opaque(va, vb);
        let max_vec = f32x4_splat(max_delta);
        let abs_deltas = f32x4_abs(deltas);
        let exceeds = f32x4_gt(abs_deltas, max_vec);
        return v128_any_true(exceeds);
    }
    // A lane is semi-transparent: the checkerboard background depends on pixel
    // position, so fall back to the exact scalar kernel for this chunk.
    for lane in 0..4 {
        let idx = chunk_start + lane;
        let pa = a32[idx];
        let pb = b32[idx];
        if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
            return true;
        }
    }
    false
}

/// wasm twin of [`within_reject_neon`]. wasm has no absolute-difference op, so
/// it is built from two saturating subtracts.
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline(always)]
unsafe fn within_reject_wasm(
    va: std::arch::wasm32::v128,
    vb: std::arch::wasm32::v128,
    reject: std::arch::wasm32::v128,
) -> bool {
    use std::arch::wasm32::*;

    let d8 = v128_and(
        v128_or(u8x16_sub_sat(va, vb), u8x16_sub_sat(vb, va)),
        u32x4_splat(0x00FF_FFFF),
    );
    let sq_lo = u16x8_extmul_low_u8x16(d8, d8);
    let sq_hi = u16x8_extmul_high_u8x16(d8, d8);
    let plo = u32x4_extadd_pairwise_u16x8(sq_lo);
    let phi = u32x4_extadd_pairwise_u16x8(sq_hi);
    // plo/phi hold (r²+g², b²+0) per pixel; fold the pairs together so
    // each lane ends up with one pixel's squared channel distance.
    let sums = u32x4_add(
        u32x4_shuffle::<0, 2, 4, 6>(plo, phi),
        u32x4_shuffle::<1, 3, 5, 7>(plo, phi),
    );
    u32x4_all_true(u32x4_le(sums, reject))
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
fn first_perceptual_diff_wasm(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    use std::arch::wasm32::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        unsafe {
            let a_ptr = a32.as_ptr().add(row_start);
            let b_ptr = b32.as_ptr().add(row_start);

            // See the NEON path: one reduce per 16 pixels instead of per 4.
            while offset + 16 <= row_width && row_width >= WIDE_SKIP_MIN_ROW {
                let a0 = v128_load(a_ptr.add(offset) as *const v128);
                let b0 = v128_load(b_ptr.add(offset) as *const v128);
                let a1 = v128_load(a_ptr.add(offset + 4) as *const v128);
                let b1 = v128_load(b_ptr.add(offset + 4) as *const v128);
                let a2 = v128_load(a_ptr.add(offset + 8) as *const v128);
                let b2 = v128_load(b_ptr.add(offset + 8) as *const v128);
                let a3 = v128_load(a_ptr.add(offset + 12) as *const v128);
                let b3 = v128_load(b_ptr.add(offset + 12) as *const v128);

                let acc = v128_or(
                    v128_or(v128_xor(a0, b0), v128_xor(a1, b1)),
                    v128_or(v128_xor(a2, b2), v128_xor(a3, b3)),
                );

                if v128_any_true(acc) {
                    let chunks = [(a0, b0), (a1, b1), (a2, b2), (a3, b3)];
                    for (k, (va, vb)) in chunks.into_iter().enumerate() {
                        let at = offset + 4 * k;
                        if chunk_exceeds_wasm(a32, b32, va, vb, row_start + at, max_delta) {
                            return Some(start_x + at as u32);
                        }
                    }
                }
                offset += 16;
            }

            while offset + 4 <= row_width {
                let va = v128_load(a_ptr.add(offset) as *const v128);
                let vb = v128_load(b_ptr.add(offset) as *const v128);
                let cmp = i32x4_eq(va, vb);
                let not_cmp = v128_not(cmp);

                if v128_any_true(not_cmp)
                    && chunk_exceeds_wasm(a32, b32, va, vb, row_start + offset, max_delta)
                {
                    return Some(start_x + offset as u32);
                }
                offset += 4;
            }
        }

        // Scalar remainder
        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
                return Some(start_x + i as u32);
            }
        }
    }
    None
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn first_perceptual_diff_avx2(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    use std::arch::x86_64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        let a_ptr = a32.as_ptr().add(row_start);
        let b_ptr = b32.as_ptr().add(row_start);

        // Wide skip: OR four 8-pixel chunks together and test once, so 32
        // identical pixels cost one branch instead of four. See the NEON path.
        while offset + 32 <= row_width && row_width >= WIDE_SKIP_MIN_ROW {
            let a0 = _mm256_loadu_si256(a_ptr.add(offset) as *const __m256i);
            let b0 = _mm256_loadu_si256(b_ptr.add(offset) as *const __m256i);
            let a1 = _mm256_loadu_si256(a_ptr.add(offset + 8) as *const __m256i);
            let b1 = _mm256_loadu_si256(b_ptr.add(offset + 8) as *const __m256i);
            let a2 = _mm256_loadu_si256(a_ptr.add(offset + 16) as *const __m256i);
            let b2 = _mm256_loadu_si256(b_ptr.add(offset + 16) as *const __m256i);
            let a3 = _mm256_loadu_si256(a_ptr.add(offset + 24) as *const __m256i);
            let b3 = _mm256_loadu_si256(b_ptr.add(offset + 24) as *const __m256i);

            let acc = _mm256_or_si256(
                _mm256_or_si256(_mm256_xor_si256(a0, b0), _mm256_xor_si256(a1, b1)),
                _mm256_or_si256(_mm256_xor_si256(a2, b2), _mm256_xor_si256(a3, b3)),
            );

            if _mm256_testz_si256(acc, acc) == 0 {
                let chunks = [(a0, b0), (a1, b1), (a2, b2), (a3, b3)];
                for (k, (va, vb)) in chunks.into_iter().enumerate() {
                    let at = offset + 8 * k;
                    if chunk_exceeds_avx2(a32, b32, va, vb, row_start + at, max_delta) {
                        return Some(start_x + at as u32);
                    }
                }
            }
            offset += 32;
        }

        // Process 8 pixels at a time with AVX2
        while offset + 8 <= row_width {
            let va = _mm256_loadu_si256(a_ptr.add(offset) as *const __m256i);
            let vb = _mm256_loadu_si256(b_ptr.add(offset) as *const __m256i);
            let cmp = _mm256_cmpeq_epi32(va, vb);
            let mask = _mm256_movemask_ps(_mm256_castsi256_ps(cmp));

            if mask != 0xFF && chunk_exceeds_avx2(a32, b32, va, vb, row_start + offset, max_delta) {
                return Some(start_x + offset as u32);
            }
            offset += 8;
        }

        // SSE4.1 for 4-pixel chunks
        while offset + 4 <= row_width {
            let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
            let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
            let cmp = _mm_cmpeq_epi32(va, vb);
            let mask = _mm_movemask_epi8(cmp);

            if mask != 0xFFFF && chunk_exceeds_sse(a32, b32, va, vb, row_start + offset, max_delta)
            {
                return Some(start_x + offset as u32);
            }
            offset += 4;
        }

        // Scalar remainder
        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
                return Some(start_x + i as u32);
            }
        }
    }
    None
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn first_perceptual_diff_sse(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    use std::arch::x86_64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        let a_ptr = a32.as_ptr().add(row_start);
        let b_ptr = b32.as_ptr().add(row_start);

        // Wide skip over 16 pixels, see the NEON path.
        while offset + 16 <= row_width && row_width >= WIDE_SKIP_MIN_ROW {
            let a0 = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
            let b0 = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
            let a1 = _mm_loadu_si128(a_ptr.add(offset + 4) as *const __m128i);
            let b1 = _mm_loadu_si128(b_ptr.add(offset + 4) as *const __m128i);
            let a2 = _mm_loadu_si128(a_ptr.add(offset + 8) as *const __m128i);
            let b2 = _mm_loadu_si128(b_ptr.add(offset + 8) as *const __m128i);
            let a3 = _mm_loadu_si128(a_ptr.add(offset + 12) as *const __m128i);
            let b3 = _mm_loadu_si128(b_ptr.add(offset + 12) as *const __m128i);

            let acc = _mm_or_si128(
                _mm_or_si128(_mm_xor_si128(a0, b0), _mm_xor_si128(a1, b1)),
                _mm_or_si128(_mm_xor_si128(a2, b2), _mm_xor_si128(a3, b3)),
            );

            if _mm_testz_si128(acc, acc) == 0 {
                let chunks = [(a0, b0), (a1, b1), (a2, b2), (a3, b3)];
                for (k, (va, vb)) in chunks.into_iter().enumerate() {
                    let at = offset + 4 * k;
                    if chunk_exceeds_sse(a32, b32, va, vb, row_start + at, max_delta) {
                        return Some(start_x + at as u32);
                    }
                }
            }
            offset += 16;
        }

        while offset + 4 <= row_width {
            let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
            let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
            let cmp = _mm_cmpeq_epi32(va, vb);
            let mask = _mm_movemask_epi8(cmp);

            if mask != 0xFFFF && chunk_exceeds_sse(a32, b32, va, vb, row_start + offset, max_delta)
            {
                return Some(start_x + offset as u32);
            }
            offset += 4;
        }

        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
                return Some(start_x + i as u32);
            }
        }
    }
    None
}

#[cfg(not(any(
    target_arch = "aarch64",
    all(target_arch = "wasm32", target_feature = "simd128"),
)))]
#[inline]
fn first_perceptual_diff_scalar(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> Option<u32> {
    for y in start_y..end_y {
        for x in start_x..end_x {
            let idx = (y * width + x) as usize;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_scalar(pa, pb, idx).abs() > max_delta as f64 {
                return Some(x);
            }
        }
    }
    None
}

// =============================================================================
// SIMD YIQ Delta - Pure SIMD RGB extraction (no scalar loops)
// =============================================================================

/// NEON: YIQ delta for 4 **fully opaque** pixels.
///
/// # Precondition
/// Every lane in both vectors must have alpha 0xFF, checked with
/// [`all_opaque_neon`] first. Semi-transparent pixels need the procedural
/// checkerboard background, whose `⌊k/φ⌋` term is position-dependent and is
/// handled by the scalar path in [`crate::yiq::color_delta`].
///
/// Skipping the blend is why this is cheaper than blending unconditionally:
/// it drops 2 alpha conversions, 2 multiplies and 12 blend ops per chunk.
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon_opaque(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
) -> std::arch::aarch64::float32x4_t {
    use std::arch::aarch64::*;

    let mask_ff = vdupq_n_u32(0xFF);

    let dr = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(va, mask_ff)),
        vcvtq_f32_u32(vandq_u32(vb, mask_ff)),
    );
    let dg = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(va, 8), mask_ff)),
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(vb, 8), mask_ff)),
    );
    let db = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(va, 16), mask_ff)),
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(vb, 16), mask_ff)),
    );

    let vy = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Y_F32[0]), dg, YIQ_Y_F32[1]),
        db,
        YIQ_Y_F32[2],
    );
    let vi = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_I_F32[0]), dg, YIQ_I_F32[1]),
        db,
        YIQ_I_F32[2],
    );
    let vq = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Q_F32[0]), dg, YIQ_Q_F32[1]),
        db,
        YIQ_Q_F32[2],
    );

    let vy2 = vmulq_f32(vy, vy);
    let vi2 = vmulq_f32(vi, vi);
    let vq2 = vmulq_f32(vq, vq);

    vfmaq_n_f32(
        vfmaq_n_f32(
            vmulq_n_f32(vy2, YIQ_WEIGHTS_F32[0]),
            vi2,
            YIQ_WEIGHTS_F32[1],
        ),
        vq2,
        YIQ_WEIGHTS_F32[2],
    )
}

/// wasm v128: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD with alpha handling
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
#[target_feature(enable = "simd128")]
unsafe fn yiq_delta_4_wasm_opaque(
    va: std::arch::wasm32::v128,
    vb: std::arch::wasm32::v128,
) -> std::arch::wasm32::v128 {
    use std::arch::wasm32::*;

    let mask_ff = u32x4_splat(0xFF);
    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = f32x4_sub(
        f32x4_convert_u32x4(v128_and(va, mask_ff)),
        f32x4_convert_u32x4(v128_and(vb, mask_ff)),
    );
    let dg = f32x4_sub(
        f32x4_convert_u32x4(v128_and(u32x4_shr(va, 8), mask_ff)),
        f32x4_convert_u32x4(v128_and(u32x4_shr(vb, 8), mask_ff)),
    );
    let db = f32x4_sub(
        f32x4_convert_u32x4(v128_and(u32x4_shr(va, 16), mask_ff)),
        f32x4_convert_u32x4(v128_and(u32x4_shr(vb, 16), mask_ff)),
    );

    let y_r = f32x4_splat(YIQ_Y_F32[0]);
    let y_g = f32x4_splat(YIQ_Y_F32[1]);
    let y_b = f32x4_splat(YIQ_Y_F32[2]);
    let i_r = f32x4_splat(YIQ_I_F32[0]);
    let i_g = f32x4_splat(YIQ_I_F32[1]);
    let i_b = f32x4_splat(YIQ_I_F32[2]);
    let q_r = f32x4_splat(YIQ_Q_F32[0]);
    let q_g = f32x4_splat(YIQ_Q_F32[1]);
    let q_b = f32x4_splat(YIQ_Q_F32[2]);
    let w_y = f32x4_splat(YIQ_WEIGHTS_F32[0]);
    let w_i = f32x4_splat(YIQ_WEIGHTS_F32[1]);
    let w_q = f32x4_splat(YIQ_WEIGHTS_F32[2]);

    // No native FMA in baseline simd128; use add(mul, c).
    let vy = f32x4_add(
        f32x4_add(f32x4_mul(dr, y_r), f32x4_mul(dg, y_g)),
        f32x4_mul(db, y_b),
    );
    let vi = f32x4_add(
        f32x4_add(f32x4_mul(dr, i_r), f32x4_mul(dg, i_g)),
        f32x4_mul(db, i_b),
    );
    let vq = f32x4_add(
        f32x4_add(f32x4_mul(dr, q_r), f32x4_mul(dg, q_g)),
        f32x4_mul(db, q_b),
    );

    let vy2 = f32x4_mul(vy, vy);
    let vi2 = f32x4_mul(vi, vi);
    let vq2 = f32x4_mul(vq, vq);

    f32x4_add(
        f32x4_add(f32x4_mul(vy2, w_y), f32x4_mul(vi2, w_i)),
        f32x4_mul(vq2, w_q),
    )
}

/// SSE4.1: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD with alpha handling
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn yiq_delta_4_sse_opaque(
    va: std::arch::x86_64::__m128i,
    vb: std::arch::x86_64::__m128i,
) -> std::arch::x86_64::__m128 {
    use std::arch::x86_64::*;

    let mask_ff = _mm_set1_epi32(0xFF);

    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(va, mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(vb, mask_ff)),
    );
    let dg = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(va, 8), mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(vb, 8), mask_ff)),
    );
    let db = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(va, 16), mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(vb, 16), mask_ff)),
    );

    let y_r = _mm_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm_set1_ps(YIQ_Y_F32[2]);
    let i_r = _mm_set1_ps(YIQ_I_F32[0]);
    let i_g = _mm_set1_ps(YIQ_I_F32[1]);
    let i_b = _mm_set1_ps(YIQ_I_F32[2]);
    let q_r = _mm_set1_ps(YIQ_Q_F32[0]);
    let q_g = _mm_set1_ps(YIQ_Q_F32[1]);
    let q_b = _mm_set1_ps(YIQ_Q_F32[2]);
    let w_y = _mm_set1_ps(YIQ_WEIGHTS_F32[0]);
    let w_i = _mm_set1_ps(YIQ_WEIGHTS_F32[1]);
    let w_q = _mm_set1_ps(YIQ_WEIGHTS_F32[2]);

    let vy = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, y_r), _mm_mul_ps(dg, y_g)),
        _mm_mul_ps(db, y_b),
    );
    let vi = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, i_r), _mm_mul_ps(dg, i_g)),
        _mm_mul_ps(db, i_b),
    );
    let vq = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, q_r), _mm_mul_ps(dg, q_g)),
        _mm_mul_ps(db, q_b),
    );

    let vy2 = _mm_mul_ps(vy, vy);
    let vi2 = _mm_mul_ps(vi, vi);
    let vq2 = _mm_mul_ps(vq, vq);

    _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(vy2, w_y), _mm_mul_ps(vi2, w_i)),
        _mm_mul_ps(vq2, w_q),
    )
}

/// AVX2+FMA: Extract RGB and compute YIQ delta for 8 pixels - pure SIMD with alpha handling
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn yiq_delta_8_avx2_opaque(
    va: std::arch::x86_64::__m256i,
    vb: std::arch::x86_64::__m256i,
) -> std::arch::x86_64::__m256 {
    use std::arch::x86_64::*;

    let mask_ff = _mm256_set1_epi32(0xFF);

    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(va, mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(vb, mask_ff)),
    );
    let dg = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(va, 8), mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(vb, 8), mask_ff)),
    );
    let db = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(va, 16), mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(vb, 16), mask_ff)),
    );

    let y_r = _mm256_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm256_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm256_set1_ps(YIQ_Y_F32[2]);
    let i_r = _mm256_set1_ps(YIQ_I_F32[0]);
    let i_g = _mm256_set1_ps(YIQ_I_F32[1]);
    let i_b = _mm256_set1_ps(YIQ_I_F32[2]);
    let q_r = _mm256_set1_ps(YIQ_Q_F32[0]);
    let q_g = _mm256_set1_ps(YIQ_Q_F32[1]);
    let q_b = _mm256_set1_ps(YIQ_Q_F32[2]);
    let w_y = _mm256_set1_ps(YIQ_WEIGHTS_F32[0]);
    let w_i = _mm256_set1_ps(YIQ_WEIGHTS_F32[1]);
    let w_q = _mm256_set1_ps(YIQ_WEIGHTS_F32[2]);

    let vy = _mm256_fmadd_ps(dr, y_r, _mm256_fmadd_ps(dg, y_g, _mm256_mul_ps(db, y_b)));
    let vi = _mm256_fmadd_ps(dr, i_r, _mm256_fmadd_ps(dg, i_g, _mm256_mul_ps(db, i_b)));
    let vq = _mm256_fmadd_ps(dr, q_r, _mm256_fmadd_ps(dg, q_g, _mm256_mul_ps(db, q_b)));

    let vy2 = _mm256_mul_ps(vy, vy);
    let vi2 = _mm256_mul_ps(vi, vi);
    let vq2 = _mm256_mul_ps(vq, vq);

    _mm256_fmadd_ps(vy2, w_y, _mm256_fmadd_ps(vi2, w_i, _mm256_mul_ps(vq2, w_q)))
}

// =============================================================================
// SIMD YIQ Delta with sign (for hot pass) - returns signed delta
// =============================================================================

/// Opaque-only YIQ delta in f32: the scalar twin of the vector kernels.
///
/// Kept in f32 so that a pixel's verdict never depends on whether it landed in
/// the vectorised body or the scalar remainder of a row.
#[inline(always)]
fn color_delta_opaque_f32(pixel_a: u32, pixel_b: u32) -> f32 {
    let dr = (pixel_a & 0xFF) as f32 - (pixel_b & 0xFF) as f32;
    let dg = ((pixel_a >> 8) & 0xFF) as f32 - ((pixel_b >> 8) & 0xFF) as f32;
    let db = ((pixel_a >> 16) & 0xFF) as f32 - ((pixel_b >> 16) & 0xFF) as f32;

    let y = dr * YIQ_Y_F32[0] + dg * YIQ_Y_F32[1] + db * YIQ_Y_F32[2];
    let i = dr * YIQ_I_F32[0] + dg * YIQ_I_F32[1] + db * YIQ_I_F32[2];
    let q = dr * YIQ_Q_F32[0] + dg * YIQ_Q_F32[1] + db * YIQ_Q_F32[2];

    let delta =
        YIQ_WEIGHTS_F32[0] * y * y + YIQ_WEIGHTS_F32[1] * i * i + YIQ_WEIGHTS_F32[2] * q * q;

    if y > 0.0 {
        -delta
    } else {
        delta
    }
}

/// Scalar YIQ delta for the diff hot loops, returned as f64.
///
/// Two precisions on purpose:
///   * **Opaque** pixels use f32 and widen. Widening is exact, so comparing the
///     widened value against a widened `max_delta` gives the same verdict as
///     the f32 comparison the vector path performs. The SIMD body and the
///     scalar remainder stay in agreement.
///   * **Semi-transparent** pixels are never vectorised, so they run the
///     canonical f64 kernel and match `@blazediff/core` exactly.
#[inline(always)]
pub(crate) fn color_delta_scalar(pixel_a: u32, pixel_b: u32, pixel_index: usize) -> f64 {
    if pixel_a == pixel_b {
        return 0.0;
    }
    if all_opaque_pair(pixel_a, pixel_b) {
        return color_delta_opaque_f32(pixel_a, pixel_b) as f64;
    }
    crate::yiq::color_delta(pixel_a, pixel_b, pixel_index)
}

/// True when both pixels are fully opaque, i.e. neither needs background
/// blending. `a & b` has 0xFF in the alpha byte only when both do.
#[inline(always)]
fn all_opaque_pair(pixel_a: u32, pixel_b: u32) -> bool {
    ((pixel_a & pixel_b) >> 24) == 0xFF
}

/// Vector form of [`all_opaque_pair`]: true when *every* lane of both vectors
/// is fully opaque, meaning the chunk can take the cheap no-blend kernel.
///
/// Three instructions (and, shift, horizontal min) to save the 16 blend ops
/// the kernel would otherwise run on every pixel.
#[cfg(target_arch = "aarch64")]
#[inline(always)]
unsafe fn all_opaque_neon(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
) -> bool {
    use std::arch::aarch64::*;
    vminvq_u32(vshrq_n_u32(vandq_u32(va, vb), 24)) == 0xFF
}

/// SSE4.1 form of [`all_opaque_pair`]. `movemask_epi8` collects the sign bit of
/// every byte; comparing `(a & b)` against an all-0xFF alpha pattern and
/// checking the alpha byte lanes is cheaper than extracting each lane.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn all_opaque_sse(va: std::arch::x86_64::__m128i, vb: std::arch::x86_64::__m128i) -> bool {
    use std::arch::x86_64::*;
    let alpha_mask = _mm_set1_epi32(0xFF00_0000u32 as i32);
    let both = _mm_and_si128(_mm_and_si128(va, vb), alpha_mask);
    // Every alpha byte must still be 0xFF after the AND.
    _mm_movemask_epi8(_mm_cmpeq_epi32(both, alpha_mask)) == 0xFFFF
}

/// AVX2 form of [`all_opaque_pair`] over 8 lanes.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
#[inline]
unsafe fn all_opaque_avx2(va: std::arch::x86_64::__m256i, vb: std::arch::x86_64::__m256i) -> bool {
    use std::arch::x86_64::*;
    let alpha_mask = _mm256_set1_epi32(0xFF00_0000u32 as i32);
    let both = _mm256_and_si256(_mm256_and_si256(va, vb), alpha_mask);
    _mm256_movemask_epi8(_mm256_cmpeq_epi32(both, alpha_mask)) == -1
}

/// wasm simd128 form of [`all_opaque_pair`].
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
#[target_feature(enable = "simd128")]
unsafe fn all_opaque_wasm(va: std::arch::wasm32::v128, vb: std::arch::wasm32::v128) -> bool {
    use std::arch::wasm32::*;
    let alpha_mask = u32x4_splat(0xFF00_0000);
    let both = v128_and(v128_and(va, vb), alpha_mask);
    u32x4_all_true(u32x4_eq(both, alpha_mask))
}

// =============================================================================
// Hot pass SIMD processing
// =============================================================================

/// Process a block of changed pixels with SIMD (aarch64)
#[cfg(target_arch = "aarch64")]
#[inline]
fn process_hot_block(
    a32: &[u32],
    b32: &[u32],
    out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    process_hot_block_neon(
        a32,
        b32,
        out32,
        width,
        start_x,
        start_y,
        end_x,
        end_y,
        max_delta,
        include_aa,
        draw_background,
        diff_color,
        diff_color_alt,
        aa_color,
        alpha_f32,
        image1,
        image2,
    )
}

/// Process a block of changed pixels with SIMD (x86_64 with cached features)
#[cfg(target_arch = "x86_64")]
#[inline]
fn process_hot_block_with_features(
    a32: &[u32],
    b32: &[u32],
    out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
    features: X86Features,
) -> u32 {
    if features.has_avx2_fma {
        unsafe {
            process_hot_block_avx2(
                a32,
                b32,
                out32,
                width,
                start_x,
                start_y,
                end_x,
                end_y,
                max_delta,
                include_aa,
                draw_background,
                diff_color,
                diff_color_alt,
                aa_color,
                alpha_f32,
                image1,
                image2,
            )
        }
    } else if features.has_sse41 {
        unsafe {
            process_hot_block_sse(
                a32,
                b32,
                out32,
                width,
                start_x,
                start_y,
                end_x,
                end_y,
                max_delta,
                include_aa,
                draw_background,
                diff_color,
                diff_color_alt,
                aa_color,
                alpha_f32,
                image1,
                image2,
            )
        }
    } else {
        process_hot_block_scalar(
            a32,
            b32,
            out32,
            width,
            start_x,
            start_y,
            end_x,
            end_y,
            max_delta,
            include_aa,
            draw_background,
            diff_color,
            diff_color_alt,
            aa_color,
            alpha_f32,
            image1,
            image2,
        )
    }
}

/// Process a block of changed pixels with SIMD (wasm32 v128)
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
fn process_hot_block(
    a32: &[u32],
    b32: &[u32],
    out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    process_hot_block_wasm(
        a32,
        b32,
        out32,
        width,
        start_x,
        start_y,
        end_x,
        end_y,
        max_delta,
        include_aa,
        draw_background,
        diff_color,
        diff_color_alt,
        aa_color,
        alpha_f32,
        image1,
        image2,
    )
}

/// Process a block of changed pixels (scalar fallback)
#[cfg(not(any(
    target_arch = "aarch64",
    target_arch = "x86_64",
    all(target_arch = "wasm32", target_feature = "simd128"),
)))]
#[inline]
fn process_hot_block(
    a32: &[u32],
    b32: &[u32],
    out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    process_hot_block_scalar(
        a32,
        b32,
        out32,
        width,
        start_x,
        start_y,
        end_x,
        end_y,
        max_delta,
        include_aa,
        draw_background,
        diff_color,
        diff_color_alt,
        aa_color,
        alpha_f32,
        image1,
        image2,
    )
}

/// NEON hot block processing
#[cfg(target_arch = "aarch64")]
#[inline]
fn process_hot_block_neon(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    use std::arch::aarch64::*;

    let mut diff_count = 0u32;
    let inv_255 = 1.0 / 255.0;
    let reject_limit = reject_bound(max_delta);
    let alpha_scaled = alpha_f32 * inv_255;

    for y in start_y..end_y {
        let row_offset = (y * width) as usize;
        let base_offset = row_offset + start_x as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        unsafe {
            let a_ptr = a32.as_ptr().add(base_offset);
            let b_ptr = b32.as_ptr().add(base_offset);

            let mask_ff = vdupq_n_u32(0xFF);
            let v255 = vdupq_n_f32(255.0);
            let max_delta_vec = vdupq_n_f32(max_delta);
            let alpha_vec = vdupq_n_f32(alpha_scaled);
            let reject = vdupq_n_u32(reject_limit);

            while offset + 4 <= row_width {
                let va = vld1q_u32(a_ptr.add(offset));
                let vb = vld1q_u32(b_ptr.add(offset));
                let cmp = vceqq_u32(va, vb);

                if vmaxvq_u32(vmvnq_u32(cmp)) == 0 {
                    // All 4 pixels identical - draw gray if needed
                    if draw_background {
                        if let Some(ref mut out) = out32 {
                            let grays = compute_gray_4_neon(va, alpha_vec, mask_ff, v255);
                            vst1q_u32(out.as_mut_ptr().add(base_offset + offset), grays);
                        }
                    }
                } else {
                    // At least one pixel differs - compute deltas
                    let opaque = all_opaque_neon(va, vb);
                    if opaque && within_reject_neon(va, vb, reject) {
                        // Provably under the threshold: the same background
                        // store as the no-exceed branch below.
                        if draw_background {
                            if let Some(ref mut out) = out32 {
                                let grays = compute_gray_4_neon(va, alpha_vec, mask_ff, v255);
                                vst1q_u32(out.as_mut_ptr().add(base_offset + offset), grays);
                            }
                        }
                        offset += 4;
                        continue;
                    }
                    // Computed once and shared by the early-out below and the
                    // per-lane spill further down, so the fast path adds no
                    // duplicate work on chunks that do contain a diff.
                    let deltas = if opaque {
                        yiq_delta_4_neon_opaque_signed(va, vb, mask_ff)
                    } else {
                        vdupq_n_f32(0.0)
                    };
                    let exceeds = vcgtq_f32(vabsq_f32(deltas), max_delta_vec);

                    if opaque {
                        if vmaxvq_u32(exceeds) == 0 {
                            // No lane crosses the threshold, so every pixel in
                            // this chunk renders as background, the same
                            // outcome as the all-identical branch above. Take
                            // the vector gray store and skip the per-lane spill.
                            if draw_background {
                                if let Some(ref mut out) = out32 {
                                    let grays = compute_gray_4_neon(va, alpha_vec, mask_ff, v255);
                                    vst1q_u32(out.as_mut_ptr().add(base_offset + offset), grays);
                                }
                            }
                            offset += 4;
                            continue;
                        }
                    }

                    let mut delta_arr: [f32; 4] = [0.0f32; 4];
                    let mut pa_arr: [u32; 4] = [0u32; 4];
                    let mut pb_arr: [u32; 4] = [0u32; 4];
                    let mut exceeds_arr = [false; 4];
                    vst1q_u32(pa_arr.as_mut_ptr(), va);
                    vst1q_u32(pb_arr.as_mut_ptr(), vb);

                    if opaque {
                        vst1q_f32(delta_arr.as_mut_ptr(), deltas);
                        let mut lane_flags: [u32; 4] = [0u32; 4];
                        vst1q_u32(lane_flags.as_mut_ptr(), exceeds);
                        for i in 0..4 {
                            exceeds_arr[i] = lane_flags[i] != 0;
                        }
                    } else {
                        // A lane is semi-transparent: the checkerboard
                        // background depends on pixel position, so fall back to
                        // the exact scalar kernel for this chunk.
                        for i in 0..4 {
                            let idx = base_offset + offset + i;
                            let d = color_delta_scalar(pa_arr[i], pb_arr[i], idx);
                            delta_arr[i] = d as f32;
                            exceeds_arr[i] = d.abs() > max_delta as f64;
                        }
                    }

                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        let pa = pa_arr[i];
                        let pb = pb_arr[i];

                        if pa != pb && exceeds_arr[i] {
                            diff_count += process_diff_pixel(
                                pixel_index,
                                delta_arr[i],
                                include_aa,
                                draw_background,
                                diff_color,
                                diff_color_alt,
                                aa_color,
                                start_x + offset as u32 + i as u32,
                                y,
                                image1,
                                image2,
                                out32.as_deref_mut(),
                            );
                        } else if draw_background {
                            if let Some(ref mut out) = out32 {
                                let g = compute_gray_pixel_f32(pa, alpha_scaled);
                                out[pixel_index] = pack_gray_pixel(g);
                            }
                        }
                    }
                }
                offset += 4;
            }
        }

        // Scalar remainder
        while offset < row_width {
            let pixel_index = base_offset + offset;
            let pa = a32[pixel_index];
            let pb = b32[pixel_index];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else {
                let delta = color_delta_scalar(pa, pb, pixel_index);
                if delta.abs() > max_delta as f64 {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta as f32,
                        include_aa,
                        draw_background,
                        diff_color,
                        diff_color_alt,
                        aa_color,
                        start_x + offset as u32,
                        y,
                        image1,
                        image2,
                        out32.as_deref_mut(),
                    );
                } else if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            }
            offset += 1;
        }
    }

    diff_count
}

/// wasm v128 hot block processing
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
fn process_hot_block_wasm(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    use std::arch::wasm32::*;

    let mut diff_count = 0u32;
    let inv_255 = 1.0 / 255.0;
    let reject_limit = reject_bound(max_delta);
    let alpha_scaled = alpha_f32 * inv_255;

    for y in start_y..end_y {
        let row_offset = (y * width) as usize;
        let base_offset = row_offset + start_x as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        unsafe {
            let a_ptr = a32.as_ptr().add(base_offset);
            let b_ptr = b32.as_ptr().add(base_offset);

            let mask_ff = u32x4_splat(0xFF);
            let v255 = f32x4_splat(255.0);
            let max_delta_vec = f32x4_splat(max_delta);
            let alpha_vec = f32x4_splat(alpha_scaled);
            let reject = u32x4_splat(reject_limit);

            while offset + 4 <= row_width {
                let va = v128_load(a_ptr.add(offset) as *const v128);
                let vb = v128_load(b_ptr.add(offset) as *const v128);
                let cmp = i32x4_eq(va, vb);

                if !v128_any_true(v128_not(cmp)) {
                    // All 4 pixels identical - draw gray if needed
                    if draw_background {
                        if let Some(ref mut out) = out32 {
                            let grays = compute_gray_4_wasm(va, alpha_vec, mask_ff, v255);
                            v128_store(
                                out.as_mut_ptr().add(base_offset + offset) as *mut v128,
                                grays,
                            );
                        }
                    }
                } else {
                    // At least one pixel differs - compute deltas
                    let opaque = all_opaque_wasm(va, vb);
                    if opaque && within_reject_wasm(va, vb, reject) {
                        // Provably under the threshold: the same background
                        // store as the no-exceed branch below.
                        if draw_background {
                            if let Some(ref mut out) = out32 {
                                let grays = compute_gray_4_wasm(va, alpha_vec, mask_ff, v255);
                                v128_store(
                                    out.as_mut_ptr().add(base_offset + offset) as *mut v128,
                                    grays,
                                );
                            }
                        }
                        offset += 4;
                        continue;
                    }
                    // Computed once and shared by the early-out below and the
                    // per-lane spill further down.
                    let deltas = if opaque {
                        yiq_delta_4_wasm_opaque_signed(va, vb)
                    } else {
                        f32x4_splat(0.0)
                    };
                    let exceeds = f32x4_gt(f32x4_abs(deltas), max_delta_vec);

                    if opaque && !v128_any_true(exceeds) {
                        // No lane crosses the threshold, so every pixel in this
                        // chunk renders as background, same outcome as the
                        // all-identical branch. Take the vector gray store and
                        // skip the per-lane spill.
                        if draw_background {
                            if let Some(ref mut out) = out32 {
                                let grays = compute_gray_4_wasm(va, alpha_vec, mask_ff, v255);
                                v128_store(
                                    out.as_mut_ptr().add(base_offset + offset) as *mut v128,
                                    grays,
                                );
                            }
                        }
                        offset += 4;
                        continue;
                    }

                    let mut delta_arr: [f32; 4] = [0.0f32; 4];
                    let mut pa_arr: [u32; 4] = [0u32; 4];
                    let mut pb_arr: [u32; 4] = [0u32; 4];
                    let mut exceeds_arr = [false; 4];
                    v128_store(pa_arr.as_mut_ptr() as *mut v128, va);
                    v128_store(pb_arr.as_mut_ptr() as *mut v128, vb);

                    if opaque {
                        v128_store(delta_arr.as_mut_ptr() as *mut v128, deltas);
                        exceeds_arr[0] = u32x4_extract_lane::<0>(exceeds) != 0;
                        exceeds_arr[1] = u32x4_extract_lane::<1>(exceeds) != 0;
                        exceeds_arr[2] = u32x4_extract_lane::<2>(exceeds) != 0;
                        exceeds_arr[3] = u32x4_extract_lane::<3>(exceeds) != 0;
                    } else {
                        // A lane is semi-transparent: the checkerboard
                        // background depends on pixel position, so fall back to
                        // the exact scalar kernel for this chunk.
                        for i in 0..4 {
                            let idx = base_offset + offset + i;
                            let d = color_delta_scalar(pa_arr[i], pb_arr[i], idx);
                            delta_arr[i] = d as f32;
                            exceeds_arr[i] = d.abs() > max_delta as f64;
                        }
                    }

                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        let pa = pa_arr[i];
                        let pb = pb_arr[i];

                        if pa != pb && exceeds_arr[i] {
                            diff_count += process_diff_pixel(
                                pixel_index,
                                delta_arr[i],
                                include_aa,
                                draw_background,
                                diff_color,
                                diff_color_alt,
                                aa_color,
                                start_x + offset as u32 + i as u32,
                                y,
                                image1,
                                image2,
                                out32.as_deref_mut(),
                            );
                        } else if draw_background {
                            if let Some(ref mut out) = out32 {
                                let g = compute_gray_pixel_f32(pa, alpha_scaled);
                                out[pixel_index] = pack_gray_pixel(g);
                            }
                        }
                    }
                }
                offset += 4;
            }
        }

        // Scalar remainder
        while offset < row_width {
            let pixel_index = base_offset + offset;
            let pa = a32[pixel_index];
            let pb = b32[pixel_index];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else {
                let delta = color_delta_scalar(pa, pb, pixel_index);
                if delta.abs() > max_delta as f64 {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta as f32,
                        include_aa,
                        draw_background,
                        diff_color,
                        diff_color_alt,
                        aa_color,
                        start_x + offset as u32,
                        y,
                        image1,
                        image2,
                        out32.as_deref_mut(),
                    );
                } else if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            }
            offset += 1;
        }
    }

    diff_count
}

/// NEON: Compute gray values for 4 pixels
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn compute_gray_4_neon(
    pixels: std::arch::aarch64::uint32x4_t,
    alpha_vec: std::arch::aarch64::float32x4_t,
    mask_ff: std::arch::aarch64::uint32x4_t,
    v255: std::arch::aarch64::float32x4_t,
) -> std::arch::aarch64::uint32x4_t {
    use std::arch::aarch64::*;

    let r = vcvtq_f32_u32(vandq_u32(pixels, mask_ff));
    let g = vcvtq_f32_u32(vandq_u32(vshrq_n_u32(pixels, 8), mask_ff));
    let b = vcvtq_f32_u32(vandq_u32(vshrq_n_u32(pixels, 16), mask_ff));
    let a = vcvtq_f32_u32(vshrq_n_u32(pixels, 24));

    let luminance = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(r, YIQ_Y_F32[0]), g, YIQ_Y_F32[1]),
        b,
        YIQ_Y_F32[2],
    );

    let gray_f = vfmaq_f32(v255, vsubq_f32(luminance, v255), vmulq_f32(alpha_vec, a));
    let gray_clamped = vminq_f32(vmaxq_f32(gray_f, vdupq_n_f32(0.0)), v255);
    let gray_u32 = vcvtq_u32_f32(gray_clamped);

    vorrq_u32(
        vorrq_u32(
            vorrq_u32(gray_u32, vshlq_n_u32(gray_u32, 8)),
            vshlq_n_u32(gray_u32, 16),
        ),
        vdupq_n_u32(0xFF000000),
    )
}

/// wasm v128: Compute gray values for 4 pixels
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
#[target_feature(enable = "simd128")]
unsafe fn compute_gray_4_wasm(
    pixels: std::arch::wasm32::v128,
    alpha_vec: std::arch::wasm32::v128,
    mask_ff: std::arch::wasm32::v128,
    v255: std::arch::wasm32::v128,
) -> std::arch::wasm32::v128 {
    use std::arch::wasm32::*;

    let r = f32x4_convert_u32x4(v128_and(pixels, mask_ff));
    let g = f32x4_convert_u32x4(v128_and(u32x4_shr(pixels, 8), mask_ff));
    let b = f32x4_convert_u32x4(v128_and(u32x4_shr(pixels, 16), mask_ff));
    let a = f32x4_convert_u32x4(u32x4_shr(pixels, 24));

    let y_r = f32x4_splat(YIQ_Y_F32[0]);
    let y_g = f32x4_splat(YIQ_Y_F32[1]);
    let y_b = f32x4_splat(YIQ_Y_F32[2]);

    let luminance = f32x4_add(
        f32x4_add(f32x4_mul(r, y_r), f32x4_mul(g, y_g)),
        f32x4_mul(b, y_b),
    );

    let gray_f = f32x4_add(
        v255,
        f32x4_mul(f32x4_sub(luminance, v255), f32x4_mul(alpha_vec, a)),
    );
    let gray_clamped = f32x4_min(f32x4_max(gray_f, f32x4_splat(0.0)), v255);
    let gray_u32 = u32x4_trunc_sat_f32x4(gray_clamped);

    v128_or(
        v128_or(
            v128_or(gray_u32, u32x4_shl(gray_u32, 8)),
            u32x4_shl(gray_u32, 16),
        ),
        u32x4_splat(0xFF000000),
    )
}

/// NEON: YIQ delta with sign for 4 pixels (with alpha handling)
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon_opaque_signed(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
    mask_ff: std::arch::aarch64::uint32x4_t,
) -> std::arch::aarch64::float32x4_t {
    use std::arch::aarch64::*;

    let dr = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(va, mask_ff)),
        vcvtq_f32_u32(vandq_u32(vb, mask_ff)),
    );
    let dg = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(va, 8), mask_ff)),
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(vb, 8), mask_ff)),
    );
    let db = vsubq_f32(
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(va, 16), mask_ff)),
        vcvtq_f32_u32(vandq_u32(vshrq_n_u32(vb, 16), mask_ff)),
    );

    let vy = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Y_F32[0]), dg, YIQ_Y_F32[1]),
        db,
        YIQ_Y_F32[2],
    );
    let vi = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_I_F32[0]), dg, YIQ_I_F32[1]),
        db,
        YIQ_I_F32[2],
    );
    let vq = vfmaq_n_f32(
        vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Q_F32[0]), dg, YIQ_Q_F32[1]),
        db,
        YIQ_Q_F32[2],
    );

    let vy2 = vmulq_f32(vy, vy);
    let vi2 = vmulq_f32(vi, vi);
    let vq2 = vmulq_f32(vq, vq);

    let delta = vfmaq_n_f32(
        vfmaq_n_f32(
            vmulq_n_f32(vy2, YIQ_WEIGHTS_F32[0]),
            vi2,
            YIQ_WEIGHTS_F32[1],
        ),
        vq2,
        YIQ_WEIGHTS_F32[2],
    );

    let zero = vdupq_n_f32(0.0);
    let y_positive = vcgtq_f32(vy, zero);
    vbslq_f32(y_positive, vnegq_f32(delta), delta)
}

/// wasm v128: YIQ delta with sign for 4 pixels (with alpha handling)
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline]
#[target_feature(enable = "simd128")]
unsafe fn yiq_delta_4_wasm_opaque_signed(
    va: std::arch::wasm32::v128,
    vb: std::arch::wasm32::v128,
) -> std::arch::wasm32::v128 {
    use std::arch::wasm32::*;

    let mask_ff = u32x4_splat(0xFF);
    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = f32x4_sub(
        f32x4_convert_u32x4(v128_and(va, mask_ff)),
        f32x4_convert_u32x4(v128_and(vb, mask_ff)),
    );
    let dg = f32x4_sub(
        f32x4_convert_u32x4(v128_and(u32x4_shr(va, 8), mask_ff)),
        f32x4_convert_u32x4(v128_and(u32x4_shr(vb, 8), mask_ff)),
    );
    let db = f32x4_sub(
        f32x4_convert_u32x4(v128_and(u32x4_shr(va, 16), mask_ff)),
        f32x4_convert_u32x4(v128_and(u32x4_shr(vb, 16), mask_ff)),
    );

    let y_r = f32x4_splat(YIQ_Y_F32[0]);
    let y_g = f32x4_splat(YIQ_Y_F32[1]);
    let y_b = f32x4_splat(YIQ_Y_F32[2]);
    let i_r = f32x4_splat(YIQ_I_F32[0]);
    let i_g = f32x4_splat(YIQ_I_F32[1]);
    let i_b = f32x4_splat(YIQ_I_F32[2]);
    let q_r = f32x4_splat(YIQ_Q_F32[0]);
    let q_g = f32x4_splat(YIQ_Q_F32[1]);
    let q_b = f32x4_splat(YIQ_Q_F32[2]);
    let w_y = f32x4_splat(YIQ_WEIGHTS_F32[0]);
    let w_i = f32x4_splat(YIQ_WEIGHTS_F32[1]);
    let w_q = f32x4_splat(YIQ_WEIGHTS_F32[2]);

    let vy = f32x4_add(
        f32x4_add(f32x4_mul(dr, y_r), f32x4_mul(dg, y_g)),
        f32x4_mul(db, y_b),
    );
    let vi = f32x4_add(
        f32x4_add(f32x4_mul(dr, i_r), f32x4_mul(dg, i_g)),
        f32x4_mul(db, i_b),
    );
    let vq = f32x4_add(
        f32x4_add(f32x4_mul(dr, q_r), f32x4_mul(dg, q_g)),
        f32x4_mul(db, q_b),
    );

    let vy2 = f32x4_mul(vy, vy);
    let vi2 = f32x4_mul(vi, vi);
    let vq2 = f32x4_mul(vq, vq);

    let delta = f32x4_add(
        f32x4_add(f32x4_mul(vy2, w_y), f32x4_mul(vi2, w_i)),
        f32x4_mul(vq2, w_q),
    );

    let zero = f32x4_splat(0.0);
    let y_positive = f32x4_gt(vy, zero);
    v128_bitselect(f32x4_neg(delta), delta, y_positive)
}

/// AVX2 hot block processing
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn process_hot_block_avx2(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    use std::arch::x86_64::*;

    let mut diff_count = 0u32;
    let alpha_scaled = alpha_f32 / 255.0;

    let mask_ff = _mm256_set1_epi32(0xFF);
    let v255 = _mm256_set1_ps(255.0);
    let max_delta_vec = _mm256_set1_ps(max_delta);
    let alpha_vec = _mm256_set1_ps(alpha_scaled);
    let zero = _mm256_setzero_ps();

    for y in start_y..end_y {
        let row_offset = (y * width) as usize;
        let base_offset = row_offset + start_x as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        let a_ptr = a32.as_ptr().add(base_offset);
        let b_ptr = b32.as_ptr().add(base_offset);

        // Process 8 pixels at a time
        while offset + 8 <= row_width {
            let va = _mm256_loadu_si256(a_ptr.add(offset) as *const __m256i);
            let vb = _mm256_loadu_si256(b_ptr.add(offset) as *const __m256i);
            let cmp = _mm256_cmpeq_epi32(va, vb);
            let mask = _mm256_movemask_ps(_mm256_castsi256_ps(cmp));

            if mask == 0xFF {
                // All 8 pixels identical
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let grays = compute_gray_8_avx2(va, alpha_vec, mask_ff, v255, zero);
                        _mm256_storeu_si256(
                            out.as_mut_ptr().add(base_offset + offset) as *mut __m256i,
                            grays,
                        );
                    }
                }
            } else {
                // At least one pixel differs
                let opaque = all_opaque_avx2(va, vb);
                // Computed once and shared by the early-out below and the
                // per-lane spill further down.
                let deltas = if opaque {
                    yiq_delta_8_avx2_opaque_signed(va, vb, mask_ff, v255, zero)
                } else {
                    _mm256_setzero_ps()
                };
                let abs_mask = _mm256_castsi256_ps(_mm256_set1_epi32(0x7FFFFFFF));
                let exceeds =
                    _mm256_cmp_ps(_mm256_and_ps(deltas, abs_mask), max_delta_vec, _CMP_GT_OQ);
                let exceeds_mask = _mm256_movemask_ps(exceeds) as u8;

                if opaque && exceeds_mask == 0 {
                    // No lane crosses the threshold, so every pixel in this
                    // chunk renders as background, the same outcome as the
                    // all-identical branch. Take the vector gray store and skip
                    // the per-lane spill.
                    if draw_background {
                        if let Some(ref mut out) = out32 {
                            let grays = compute_gray_8_avx2(va, alpha_vec, mask_ff, v255, zero);
                            _mm256_storeu_si256(
                                out.as_mut_ptr().add(base_offset + offset) as *mut __m256i,
                                grays,
                            );
                        }
                    }
                    offset += 8;
                    continue;
                }

                let mut delta_arr: [f32; 8] = [0.0f32; 8];
                let mut pa_arr: [u32; 8] = [0u32; 8];
                let mut pb_arr: [u32; 8] = [0u32; 8];
                let mut exceeds_arr = [false; 8];
                _mm256_storeu_si256(pa_arr.as_mut_ptr() as *mut __m256i, va);
                _mm256_storeu_si256(pb_arr.as_mut_ptr() as *mut __m256i, vb);

                if opaque {
                    _mm256_storeu_ps(delta_arr.as_mut_ptr(), deltas);
                    for i in 0..8 {
                        exceeds_arr[i] = (exceeds_mask >> i) & 1 != 0;
                    }
                } else {
                    // A lane is semi-transparent: the checkerboard background
                    // depends on pixel position, so fall back to the exact
                    // scalar kernel for this chunk.
                    for i in 0..8 {
                        let idx = base_offset + offset + i;
                        let d = color_delta_scalar(pa_arr[i], pb_arr[i], idx);
                        delta_arr[i] = d as f32;
                        exceeds_arr[i] = d.abs() > max_delta as f64;
                    }
                }

                for i in 0..8 {
                    let pixel_index = base_offset + offset + i;
                    let pa = pa_arr[i];
                    let pb = pb_arr[i];

                    if pa == pb {
                        if draw_background {
                            if let Some(ref mut out) = out32 {
                                let g = compute_gray_pixel_f32(pa, alpha_scaled);
                                out[pixel_index] = pack_gray_pixel(g);
                            }
                        }
                    } else if exceeds_arr[i] {
                        diff_count += process_diff_pixel(
                            pixel_index,
                            delta_arr[i],
                            include_aa,
                            draw_background,
                            diff_color,
                            diff_color_alt,
                            aa_color,
                            start_x + offset as u32 + i as u32,
                            y,
                            image1,
                            image2,
                            out32.as_deref_mut(),
                        );
                    } else if draw_background {
                        if let Some(ref mut out) = out32 {
                            let g = compute_gray_pixel_f32(pa, alpha_scaled);
                            out[pixel_index] = pack_gray_pixel(g);
                        }
                    }
                }
            }
            offset += 8;
        }

        // SSE for 4-pixel chunks
        while offset + 4 <= row_width {
            diff_count += process_hot_chunk_sse(
                a32,
                b32,
                out32.as_deref_mut(),
                base_offset,
                offset,
                row_width,
                max_delta,
                include_aa,
                draw_background,
                diff_color,
                diff_color_alt,
                aa_color,
                alpha_scaled,
                start_x,
                y,
                image1,
                image2,
            );
            offset += 4;
        }

        // Scalar remainder
        while offset < row_width {
            let pixel_index = base_offset + offset;
            let pa = a32[pixel_index];
            let pb = b32[pixel_index];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else {
                let delta = color_delta_scalar(pa, pb, pixel_index);
                if delta.abs() > max_delta as f64 {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta as f32,
                        include_aa,
                        draw_background,
                        diff_color,
                        diff_color_alt,
                        aa_color,
                        start_x + offset as u32,
                        y,
                        image1,
                        image2,
                        out32.as_deref_mut(),
                    );
                } else if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            }
            offset += 1;
        }
    }

    diff_count
}

/// AVX2: Compute gray values for 8 pixels
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn compute_gray_8_avx2(
    pixels: std::arch::x86_64::__m256i,
    alpha_vec: std::arch::x86_64::__m256,
    mask_ff: std::arch::x86_64::__m256i,
    v255: std::arch::x86_64::__m256,
    zero: std::arch::x86_64::__m256,
) -> std::arch::x86_64::__m256i {
    use std::arch::x86_64::*;

    let r = _mm256_cvtepi32_ps(_mm256_and_si256(pixels, mask_ff));
    let g = _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(pixels, 8), mask_ff));
    let b = _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(pixels, 16), mask_ff));
    let a = _mm256_cvtepi32_ps(_mm256_srli_epi32(pixels, 24));

    let y_r = _mm256_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm256_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm256_set1_ps(YIQ_Y_F32[2]);

    let luminance = _mm256_fmadd_ps(r, y_r, _mm256_fmadd_ps(g, y_g, _mm256_mul_ps(b, y_b)));
    let gray_f = _mm256_fmadd_ps(
        _mm256_sub_ps(luminance, v255),
        _mm256_mul_ps(alpha_vec, a),
        v255,
    );
    let gray_clamped = _mm256_min_ps(_mm256_max_ps(gray_f, zero), v255);
    // Truncate, don't round: the scalar path (`as u8`) and NEON's `vcvtq_u32_f32`
    // both truncate toward zero, and `_mm256_cvtps_epi32` would instead follow
    // the current rounding mode (nearest-even by default). Using it made the
    // gray background differ by 1 between vector-path and scalar-path pixels of
    // the same image, and between x86 and ARM output.
    let gray_u32 = _mm256_cvttps_epi32(gray_clamped);

    _mm256_or_si256(
        _mm256_or_si256(
            _mm256_or_si256(gray_u32, _mm256_slli_epi32(gray_u32, 8)),
            _mm256_slli_epi32(gray_u32, 16),
        ),
        _mm256_set1_epi32(0xFF000000u32 as i32),
    )
}

/// AVX2: YIQ delta with sign for 8 pixels (with alpha handling)
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn yiq_delta_8_avx2_opaque_signed(
    va: std::arch::x86_64::__m256i,
    vb: std::arch::x86_64::__m256i,
    mask_ff: std::arch::x86_64::__m256i,
    _v255: std::arch::x86_64::__m256,
    zero: std::arch::x86_64::__m256,
) -> std::arch::x86_64::__m256 {
    use std::arch::x86_64::*;

    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(va, mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(vb, mask_ff)),
    );
    let dg = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(va, 8), mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(vb, 8), mask_ff)),
    );
    let db = _mm256_sub_ps(
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(va, 16), mask_ff)),
        _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(vb, 16), mask_ff)),
    );

    let y_r = _mm256_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm256_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm256_set1_ps(YIQ_Y_F32[2]);
    let i_r = _mm256_set1_ps(YIQ_I_F32[0]);
    let i_g = _mm256_set1_ps(YIQ_I_F32[1]);
    let i_b = _mm256_set1_ps(YIQ_I_F32[2]);
    let q_r = _mm256_set1_ps(YIQ_Q_F32[0]);
    let q_g = _mm256_set1_ps(YIQ_Q_F32[1]);
    let q_b = _mm256_set1_ps(YIQ_Q_F32[2]);
    let w_y = _mm256_set1_ps(YIQ_WEIGHTS_F32[0]);
    let w_i = _mm256_set1_ps(YIQ_WEIGHTS_F32[1]);
    let w_q = _mm256_set1_ps(YIQ_WEIGHTS_F32[2]);

    let vy = _mm256_fmadd_ps(dr, y_r, _mm256_fmadd_ps(dg, y_g, _mm256_mul_ps(db, y_b)));
    let vi = _mm256_fmadd_ps(dr, i_r, _mm256_fmadd_ps(dg, i_g, _mm256_mul_ps(db, i_b)));
    let vq = _mm256_fmadd_ps(dr, q_r, _mm256_fmadd_ps(dg, q_g, _mm256_mul_ps(db, q_b)));

    let vy2 = _mm256_mul_ps(vy, vy);
    let vi2 = _mm256_mul_ps(vi, vi);
    let vq2 = _mm256_mul_ps(vq, vq);

    let delta = _mm256_fmadd_ps(vy2, w_y, _mm256_fmadd_ps(vi2, w_i, _mm256_mul_ps(vq2, w_q)));

    let y_positive = _mm256_cmp_ps(vy, zero, _CMP_GT_OQ);
    let neg_delta = _mm256_sub_ps(zero, delta);
    _mm256_blendv_ps(delta, neg_delta, y_positive)
}

/// SSE hot block processing
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn process_hot_block_sse(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    let mut diff_count = 0u32;
    let alpha_scaled = alpha_f32 / 255.0;

    for y in start_y..end_y {
        let row_offset = (y * width) as usize;
        let base_offset = row_offset + start_x as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        while offset + 4 <= row_width {
            diff_count += process_hot_chunk_sse(
                a32,
                b32,
                out32.as_deref_mut(),
                base_offset,
                offset,
                row_width,
                max_delta,
                include_aa,
                draw_background,
                diff_color,
                diff_color_alt,
                aa_color,
                alpha_scaled,
                start_x,
                y,
                image1,
                image2,
            );
            offset += 4;
        }

        // Scalar remainder
        while offset < row_width {
            let pixel_index = base_offset + offset;
            let pa = a32[pixel_index];
            let pb = b32[pixel_index];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else {
                let delta = color_delta_scalar(pa, pb, pixel_index);
                if delta.abs() > max_delta as f64 {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta as f32,
                        include_aa,
                        draw_background,
                        diff_color,
                        diff_color_alt,
                        aa_color,
                        start_x + offset as u32,
                        y,
                        image1,
                        image2,
                        out32.as_deref_mut(),
                    );
                } else if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            }
            offset += 1;
        }
    }

    diff_count
}

/// SSE: Process 4-pixel chunk
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn process_hot_chunk_sse(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    base_offset: usize,
    offset: usize,
    _row_width: usize,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_scaled: f32,
    start_x: u32,
    y: u32,
    image1: Px,
    image2: Px,
) -> u32 {
    use std::arch::x86_64::*;

    let mut diff_count = 0u32;

    let a_ptr = a32.as_ptr().add(base_offset + offset);
    let b_ptr = b32.as_ptr().add(base_offset + offset);

    let va = _mm_loadu_si128(a_ptr as *const __m128i);
    let vb = _mm_loadu_si128(b_ptr as *const __m128i);
    let cmp = _mm_cmpeq_epi32(va, vb);
    let mask = _mm_movemask_epi8(cmp);

    let mask_ff = _mm_set1_epi32(0xFF);
    let v255 = _mm_set1_ps(255.0);
    let zero = _mm_setzero_ps();
    let alpha_vec = _mm_set1_ps(alpha_scaled);

    if mask == 0xFFFF {
        // All 4 pixels identical
        if draw_background {
            if let Some(ref mut out) = out32 {
                let grays = compute_gray_4_sse(va, alpha_vec, mask_ff, v255, zero);
                _mm_storeu_si128(
                    out.as_mut_ptr().add(base_offset + offset) as *mut __m128i,
                    grays,
                );
            }
        }
    } else {
        let opaque = all_opaque_sse(va, vb);
        // Computed once and shared by the early-out below and the per-lane
        // spill further down.
        let deltas_v = if opaque {
            yiq_delta_4_sse_opaque_signed(va, vb, mask_ff, zero)
        } else {
            _mm_setzero_ps()
        };
        let abs_mask_v = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
        let exceeds_v = _mm_cmpgt_ps(_mm_and_ps(deltas_v, abs_mask_v), _mm_set1_ps(max_delta));

        if opaque && _mm_movemask_ps(exceeds_v) == 0 {
            // No lane crosses the threshold, so every pixel in this chunk
            // renders as background, the same outcome as the all-identical
            // branch. Take the vector gray store and skip the per-lane spill.
            if draw_background {
                if let Some(ref mut out) = out32 {
                    let grays = compute_gray_4_sse(va, alpha_vec, mask_ff, v255, zero);
                    _mm_storeu_si128(
                        out.as_mut_ptr().add(base_offset + offset) as *mut __m128i,
                        grays,
                    );
                }
            }
            return 0;
        }

        let mut delta_arr: [f32; 4] = [0.0f32; 4];
        let mut pa_arr: [u32; 4] = [0u32; 4];
        let mut pb_arr: [u32; 4] = [0u32; 4];
        let mut exceeds_arr = [false; 4];
        _mm_storeu_si128(pa_arr.as_mut_ptr() as *mut __m128i, va);
        _mm_storeu_si128(pb_arr.as_mut_ptr() as *mut __m128i, vb);

        if opaque {
            let deltas = deltas_v;
            let max_delta_vec = _mm_set1_ps(max_delta);
            let abs_mask = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
            let abs_deltas = _mm_and_ps(deltas, abs_mask);
            let exceeds = _mm_cmpgt_ps(abs_deltas, max_delta_vec);
            let exceeds_mask = _mm_movemask_ps(exceeds) as u8;
            _mm_storeu_ps(delta_arr.as_mut_ptr(), deltas);
            for i in 0..4 {
                exceeds_arr[i] = (exceeds_mask >> i) & 1 != 0;
            }
        } else {
            // A lane is semi-transparent: the checkerboard background depends
            // on pixel position, so fall back to the exact scalar kernel for
            // this chunk.
            for i in 0..4 {
                let idx = base_offset + offset + i;
                let d = color_delta_scalar(pa_arr[i], pb_arr[i], idx);
                delta_arr[i] = d as f32;
                exceeds_arr[i] = d.abs() > max_delta as f64;
            }
        }

        for i in 0..4 {
            let pixel_index = base_offset + offset + i;
            let pa = pa_arr[i];
            let pb = pb_arr[i];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else if exceeds_arr[i] {
                diff_count += process_diff_pixel(
                    pixel_index,
                    delta_arr[i],
                    include_aa,
                    draw_background,
                    diff_color,
                    diff_color_alt,
                    aa_color,
                    start_x + offset as u32 + i as u32,
                    y,
                    image1,
                    image2,
                    out32.as_deref_mut(),
                );
            } else if draw_background {
                if let Some(ref mut out) = out32 {
                    let g = compute_gray_pixel_f32(pa, alpha_scaled);
                    out[pixel_index] = pack_gray_pixel(g);
                }
            }
        }
    }

    diff_count
}

/// SSE: Compute gray values for 4 pixels
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn compute_gray_4_sse(
    pixels: std::arch::x86_64::__m128i,
    alpha_vec: std::arch::x86_64::__m128,
    mask_ff: std::arch::x86_64::__m128i,
    v255: std::arch::x86_64::__m128,
    zero: std::arch::x86_64::__m128,
) -> std::arch::x86_64::__m128i {
    use std::arch::x86_64::*;

    let r = _mm_cvtepi32_ps(_mm_and_si128(pixels, mask_ff));
    let g = _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(pixels, 8), mask_ff));
    let b = _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(pixels, 16), mask_ff));
    let a = _mm_cvtepi32_ps(_mm_srli_epi32(pixels, 24));

    let y_r = _mm_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm_set1_ps(YIQ_Y_F32[2]);

    let luminance = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(r, y_r), _mm_mul_ps(g, y_g)),
        _mm_mul_ps(b, y_b),
    );
    let gray_f = _mm_add_ps(
        v255,
        _mm_mul_ps(_mm_sub_ps(luminance, v255), _mm_mul_ps(alpha_vec, a)),
    );
    let gray_clamped = _mm_min_ps(_mm_max_ps(gray_f, zero), v255);
    // Truncate, not round. See `compute_gray_8_avx2`.
    let gray_u32 = _mm_cvttps_epi32(gray_clamped);

    _mm_or_si128(
        _mm_or_si128(
            _mm_or_si128(gray_u32, _mm_slli_epi32(gray_u32, 8)),
            _mm_slli_epi32(gray_u32, 16),
        ),
        _mm_set1_epi32(0xFF000000u32 as i32),
    )
}

/// SSE: YIQ delta with sign for 4 pixels (with alpha handling)
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn yiq_delta_4_sse_opaque_signed(
    va: std::arch::x86_64::__m128i,
    vb: std::arch::x86_64::__m128i,
    mask_ff: std::arch::x86_64::__m128i,
    zero: std::arch::x86_64::__m128,
) -> std::arch::x86_64::__m128 {
    use std::arch::x86_64::*;

    // Callers guarantee every lane is opaque (see `all_opaque_*`), so no
    // background blending is needed: the deltas are the raw channel
    // differences. Skipping the blend is what makes this cheaper than
    // blending unconditionally.
    let dr = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(va, mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(vb, mask_ff)),
    );
    let dg = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(va, 8), mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(vb, 8), mask_ff)),
    );
    let db = _mm_sub_ps(
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(va, 16), mask_ff)),
        _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(vb, 16), mask_ff)),
    );

    let y_r = _mm_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm_set1_ps(YIQ_Y_F32[2]);
    let i_r = _mm_set1_ps(YIQ_I_F32[0]);
    let i_g = _mm_set1_ps(YIQ_I_F32[1]);
    let i_b = _mm_set1_ps(YIQ_I_F32[2]);
    let q_r = _mm_set1_ps(YIQ_Q_F32[0]);
    let q_g = _mm_set1_ps(YIQ_Q_F32[1]);
    let q_b = _mm_set1_ps(YIQ_Q_F32[2]);
    let w_y = _mm_set1_ps(YIQ_WEIGHTS_F32[0]);
    let w_i = _mm_set1_ps(YIQ_WEIGHTS_F32[1]);
    let w_q = _mm_set1_ps(YIQ_WEIGHTS_F32[2]);

    let vy = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, y_r), _mm_mul_ps(dg, y_g)),
        _mm_mul_ps(db, y_b),
    );
    let vi = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, i_r), _mm_mul_ps(dg, i_g)),
        _mm_mul_ps(db, i_b),
    );
    let vq = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(dr, q_r), _mm_mul_ps(dg, q_g)),
        _mm_mul_ps(db, q_b),
    );

    let vy2 = _mm_mul_ps(vy, vy);
    let vi2 = _mm_mul_ps(vi, vi);
    let vq2 = _mm_mul_ps(vq, vq);

    let delta = _mm_add_ps(
        _mm_add_ps(_mm_mul_ps(vy2, w_y), _mm_mul_ps(vi2, w_i)),
        _mm_mul_ps(vq2, w_q),
    );

    // Apply sign based on Y
    let y_positive = _mm_cmpgt_ps(vy, zero);
    let neg_delta = _mm_sub_ps(zero, delta);
    _mm_blendv_ps(delta, neg_delta, y_positive)
}

/// Scalar hot block processing (fallback for non-SIMD architectures or x86_64 without SSE4.1)
#[cfg(not(any(
    target_arch = "aarch64",
    all(target_arch = "wasm32", target_feature = "simd128"),
)))]
fn process_hot_block_scalar(
    a32: &[u32],
    b32: &[u32],
    mut out32: Option<&mut [u32]>,
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha_f32: f32,
    image1: Px,
    image2: Px,
) -> u32 {
    let mut diff_count = 0u32;
    let alpha_scaled = alpha_f32 / 255.0;

    for y in start_y..end_y {
        for x in start_x..end_x {
            let pixel_index = (y * width + x) as usize;
            let pa = a32[pixel_index];
            let pb = b32[pixel_index];

            if pa == pb {
                if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            } else {
                let delta = color_delta_scalar(pa, pb, pixel_index);
                if delta.abs() > max_delta as f64 {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta as f32,
                        include_aa,
                        draw_background,
                        diff_color,
                        diff_color_alt,
                        aa_color,
                        x,
                        y,
                        image1,
                        image2,
                        out32.as_deref_mut(),
                    );
                } else if draw_background {
                    if let Some(ref mut out) = out32 {
                        let g = compute_gray_pixel_f32(pa, alpha_scaled);
                        out[pixel_index] = pack_gray_pixel(g);
                    }
                }
            }
        }
    }

    diff_count
}

/// Process a single differing pixel (AA check + output)
#[inline(always)]
fn process_diff_pixel(
    pixel_index: usize,
    delta: f32,
    include_aa: bool,
    _draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    x: u32,
    y: u32,
    image1: Px,
    image2: Px,
    out32: Option<&mut [u32]>,
) -> u32 {
    if include_aa {
        if let Some(out) = out32 {
            let color = if delta < 0.0 {
                diff_color_alt
            } else {
                diff_color
            };
            out[pixel_index] = color;
        }
        1
    } else {
        let is_aa =
            is_antialiased_px(image1, image2, x, y) || is_antialiased_px(image2, image1, x, y);
        if is_aa {
            if let Some(out) = out32 {
                out[pixel_index] = aa_color;
            }
            0
        } else {
            if let Some(out) = out32 {
                let color = if delta < 0.0 {
                    diff_color_alt
                } else {
                    diff_color
                };
                out[pixel_index] = color;
            }
            1
        }
    }
}
/// Compares two RGBA images pixel by pixel.
///
/// Images of different sizes return [`DiffResult::DimensionMismatch`]. Errors
/// are reserved for invalid buffers and masks.
pub fn diff(
    image1: &Image,
    image2: &Image,
    output: Option<&mut Image>,
    options: &DiffOptions,
) -> Result<DiffResult, DiffError> {
    diff_with(image1, image2, output, options, true)
}

/// [`diff`] that, with `fill_identical` false, leaves `output` unwritten when
/// nothing differs. Callers that only save the output for differing images
/// (the CLI, N-API and Python file outputs) skip that fill.
#[doc(hidden)]
pub fn diff_with(
    image1: &Image,
    image2: &Image,
    output: Option<&mut Image>,
    options: &DiffOptions,
    fill_identical: bool,
) -> Result<DiffResult, DiffError> {
    check_data_size(image1)?;
    check_data_size(image2)?;
    if let Some(out) = output.as_deref() {
        if image1.width == image2.width && image1.height == image2.height {
            check_data_size(out)?;
            if out.width != image1.width || out.height != image1.height {
                return Err(DiffError::InvalidDataSize {
                    expected: image1.width as usize * image1.height as usize * 4,
                    actual: out.data.len(),
                });
            }
        }
    }
    diff_rgba_with(
        image1.into(),
        image2.into(),
        output.map(|out| out.data.as_mut_slice()),
        options,
        fill_identical,
    )
}

/// [`diff`] over borrowed RGBA8 bytes, so callers skip the copy into an [`Image`].
/// `output` must hold width × height × 4 bytes. Buffers that are not 4-byte aligned are copied.
pub fn diff_rgba(
    image1: ImageView,
    image2: ImageView,
    output: Option<&mut [u8]>,
    options: &DiffOptions,
) -> Result<DiffResult, DiffError> {
    diff_rgba_with(image1, image2, output, options, true)
}

/// [`diff_rgba`] with [`diff_with`]'s `fill_identical`.
pub(crate) fn diff_rgba_with(
    image1: ImageView,
    image2: ImageView,
    output: Option<&mut [u8]>,
    options: &DiffOptions,
    fill_identical: bool,
) -> Result<DiffResult, DiffError> {
    for image in [image1, image2] {
        expect_len(image.data.len(), image.width, image.height)?;
    }
    if image1.width != image2.width || image1.height != image2.height {
        return Ok(DiffResult::DimensionMismatch {
            a: Size {
                width: image1.width,
                height: image1.height,
            },
            b: Size {
                width: image2.width,
                height: image2.height,
            },
        });
    }
    if let Some(out) = output.as_deref() {
        expect_len(out.len(), image1.width, image1.height)?;
    }
    if let Some(mask) = options.mask.as_deref() {
        let expected = image1.width as usize * image1.height as usize;
        if mask.len() != expected {
            return Err(DiffError::InvalidMaskSize {
                expected,
                actual: mask.len(),
            });
        }
    }

    let same_buffer = image1.data.as_ptr() == image2.data.as_ptr();
    let a_words = words(image1.data);
    let b_words = (!same_buffer).then(|| words(image2.data));
    let a = Px {
        data: &a_words,
        width: image1.width,
        height: image1.height,
    };
    // One buffer passed twice must stay one buffer, even when it was copied.
    let b = b_words.as_deref().map_or(a, |data| Px { data, ..a });
    let Some(out) = output else {
        return Ok(diff_px(a, b, None, options, fill_identical));
    };
    // SAFETY: u32 has no invalid bit patterns and align_to only yields the
    // aligned middle, so the cast is sound.
    let (head, body, tail) = unsafe { out.align_to_mut::<u32>() };
    if head.is_empty() && tail.is_empty() {
        return Ok(diff_px(a, b, Some(body), options, fill_identical));
    }
    // Misaligned target: render into aligned scratch seeded with its bytes,
    // so pixels the diff leaves unwritten stay untouched.
    let mut scratch = words(out).into_owned();
    let result = diff_px(a, b, Some(&mut scratch), options, fill_identical);
    for (dst, word) in out.chunks_exact_mut(4).zip(&scratch) {
        dst.copy_from_slice(&word.to_ne_bytes());
    }
    Ok(result)
}

/// The bytes as native-endian pixels, borrowed when aligned.
fn words(bytes: &[u8]) -> std::borrow::Cow<'_, [u32]> {
    // SAFETY: see `diff_rgba_with`.
    let (head, body, tail) = unsafe { bytes.align_to::<u32>() };
    if head.is_empty() && tail.is_empty() {
        return std::borrow::Cow::Borrowed(body);
    }
    std::borrow::Cow::Owned(
        bytes
            .chunks_exact(4)
            .map(|px| u32::from_ne_bytes([px[0], px[1], px[2], px[3]]))
            .collect(),
    )
}

fn diff_px(
    a: Px,
    b: Px,
    mut output: Option<&mut [u32]>,
    options: &DiffOptions,
    fill_identical: bool,
) -> DiffResult {
    let (width, height) = (a.width, a.height);
    let total_pixels = width * height;
    let render = &options.render;
    let transparent = render.background == Background::Transparent;
    // An empty window hit, reported when nothing differs.
    let no_hit = crate::window::window_side(options.window, width, height).map(|_| WindowHit {
        x: 0,
        y: 0,
        count: 0,
    });

    if transparent {
        if let Some(out) = output.as_deref_mut() {
            out.fill(0);
        }
    }

    if a.data.as_ptr() == b.data.as_ptr() {
        if let Some(out) = output {
            if !transparent {
                fill_gray_rect(a.data, width, out, render.alpha, 0, 0, width, height);
            }
        }
        return DiffResult::compared(0, total_pixels, no_hit);
    }

    // Fast path on *decoded* RGBA equality: a vectorized memcmp that exits on
    // the first mismatch, so differing images pay tens of nanoseconds.
    //
    // Not on wasm32: `wasm32-unknown-unknown` has no libc, so this lowers to
    // `compiler_builtins`' scalar byte-loop memcmp (~2.4 GB/s). The band scan
    // below reaches the same verdict with v128 compares in under half that.
    #[cfg(not(target_arch = "wasm32"))]
    if a.data == b.data {
        if fill_identical && !transparent {
            if let Some(out) = output {
                fill_gray_rect(a.data, width, out, render.alpha, 0, 0, width, height);
            }
        }
        return DiffResult::compared(0, total_pixels, no_hit);
    }

    if options.metric != Metric::Yiq || options.mask.is_some() || options.window.is_some() {
        return diff_extended(a, b, output, options);
    }

    let scan = Scan::new(a, b, options, output.is_some() && !transparent);
    DiffResult::compared(scan.run(output, fill_identical), total_pixels, None)
}

/// The default YIQ diff, walked in bands of one block row.
///
/// Each band is first scanned in row order to flag the blocks holding a pixel
/// over the threshold, then rendered while it is still in cache: unflagged
/// blocks get the gray background, flagged ones the per-pixel hot kernel.
/// Blocks, kernels and their chunk alignment are those of the original
/// block walk, so counts and output bytes do not depend on the walk order.
struct Scan<'a> {
    a: Px<'a>,
    b: Px<'a>,
    block_size: u32,
    blocks_x: usize,
    max_delta: f32,
    include_aa: bool,
    draw_background: bool,
    diff_color: u32,
    diff_color_alt: u32,
    aa_color: u32,
    alpha: f64,
    #[cfg(target_arch = "x86_64")]
    features: X86Features,
}

impl<'a> Scan<'a> {
    fn new(a: Px<'a>, b: Px<'a>, options: &DiffOptions, draw_background: bool) -> Self {
        let render = &options.render;
        let block_size = calculate_block_size(a.width, a.height);
        Self {
            a,
            b,
            block_size,
            blocks_x: a.width.div_ceil(block_size) as usize,
            max_delta: threshold_to_max_delta_f32(options.threshold),
            include_aa: !options.antialiasing,
            draw_background,
            diff_color: pack_color_pixel(&render.diff_color),
            diff_color_alt: pack_color_pixel(
                render.diff_color_alt.as_ref().unwrap_or(&render.diff_color),
            ),
            aa_color: pack_color_pixel(&render.aa_color),
            alpha: render.alpha,
            #[cfg(target_arch = "x86_64")]
            features: X86Features::detect(),
        }
    }

    /// Diff count. With `fill_identical` false the output stays unwritten
    /// until the first flagged block, then the skipped rows are caught up.
    fn run(&self, mut output: Option<&mut [u32]>, fill_identical: bool) -> u32 {
        let (width, height) = (self.a.width, self.a.height);
        let mut flags = vec![false; self.blocks_x];
        let mut drawn_to = 0;
        let mut count = 0;
        let mut changed = false;
        for y0 in (0..height).step_by(self.block_size as usize) {
            let y1 = (y0 + self.block_size).min(height);
            let flagged = self.flag_band(&mut flags, y0, y1);
            let out = output.as_deref_mut().filter(|_| self.draw_background);
            if !flagged {
                if let Some(out) = out.filter(|_| fill_identical || changed) {
                    self.fill(out, 0, drawn_to, width, y1);
                    drawn_to = y1;
                }
                continue;
            }
            if let Some(out) = out {
                self.fill(out, 0, drawn_to, width, y0);
                drawn_to = y1;
            }
            changed = true;
            count += self.render_band(output.as_deref_mut(), &flags, y0, y1);
        }
        count
    }

    /// Flags each block column of the band that holds a pixel over the
    /// threshold. Returns whether any did.
    ///
    /// Each row scans a run of unflagged blocks in one kernel call. A hit
    /// flags its block and the scan resumes at the next one. Kernel chunks
    /// are 4 or 8 pixels and never cross a block edge, so every block gets
    /// the verdict a scan of that block alone would give.
    fn flag_band(&self, flags: &mut [bool], y0: u32, y1: u32) -> bool {
        flags.fill(false);
        let mut clean = flags.len();
        for y in y0..y1 {
            let mut column = 0;
            while column < flags.len() {
                if flags[column] {
                    column += 1;
                    continue;
                }
                let run_end = (column..flags.len())
                    .find(|&c| flags[c])
                    .unwrap_or(flags.len());
                let end_x = self.block_end(run_end - 1);
                while column < run_end {
                    let Some(x) = self.first_diff(y, self.block_start(column), end_x) else {
                        break;
                    };
                    let block = (x / self.block_size) as usize;
                    flags[block] = true;
                    clean -= 1;
                    column = block + 1;
                }
                column = run_end;
            }
            if clean == 0 {
                break;
            }
        }
        clean < flags.len()
    }

    #[inline]
    fn block_start(&self, column: usize) -> u32 {
        column as u32 * self.block_size
    }

    #[inline]
    fn block_end(&self, column: usize) -> u32 {
        (self.block_start(column) + self.block_size).min(self.a.width)
    }

    /// Hot kernel on flagged blocks, gray fill on runs of unflagged ones.
    fn render_band(&self, mut output: Option<&mut [u32]>, flags: &[bool], y0: u32, y1: u32) -> u32 {
        let mut count = 0;
        let mut column = 0;
        while column < flags.len() {
            let start_x = self.block_start(column);
            if flags[column] {
                count += self.hot(
                    output.as_deref_mut(),
                    start_x,
                    y0,
                    self.block_end(column),
                    y1,
                );
                column += 1;
                continue;
            }
            while column < flags.len() && !flags[column] {
                column += 1;
            }
            if let Some(out) = output.as_deref_mut().filter(|_| self.draw_background) {
                self.fill(out, start_x, y0, self.block_end(column - 1), y1);
            }
        }
        count
    }

    fn fill(&self, out: &mut [u32], start_x: u32, start_y: u32, end_x: u32, end_y: u32) {
        if start_y < end_y {
            let (data, width) = (self.a.data, self.a.width);
            fill_gray_rect(data, width, out, self.alpha, start_x, start_y, end_x, end_y);
        }
    }

    /// Column of the first pixel over the threshold in `start_x..end_x` of row `y`.
    #[inline]
    fn first_diff(&self, y: u32, start_x: u32, end_x: u32) -> Option<u32> {
        let (a32, b32, width) = (self.a.data, self.b.data, self.a.width);
        let row = (y * width) as usize;
        let (from, to) = (row + start_x as usize, row + end_x as usize);
        let skipped = equal_prefix(&a32[from..to], &b32[from..to]);
        if skipped == to - from {
            return None;
        }
        // A multiple of 64 keeps the kernel's 4/8-pixel chunks where they were.
        let start_x = start_x + skipped as u32;
        #[cfg(target_arch = "x86_64")]
        return first_perceptual_diff_with_features(
            a32,
            b32,
            width,
            start_x,
            y,
            end_x,
            y + 1,
            self.max_delta,
            self.features,
        );
        #[cfg(not(target_arch = "x86_64"))]
        first_perceptual_diff(a32, b32, width, start_x, y, end_x, y + 1, self.max_delta)
    }

    fn hot(
        &self,
        out32: Option<&mut [u32]>,
        start_x: u32,
        start_y: u32,
        end_x: u32,
        end_y: u32,
    ) -> u32 {
        #[cfg(target_arch = "x86_64")]
        return process_hot_block_with_features(
            self.a.data,
            self.b.data,
            out32,
            self.a.width,
            start_x,
            start_y,
            end_x,
            end_y,
            self.max_delta,
            self.include_aa,
            self.draw_background,
            self.diff_color,
            self.diff_color_alt,
            self.aa_color,
            self.alpha as f32,
            self.a,
            self.b,
            self.features,
        );
        #[cfg(not(target_arch = "x86_64"))]
        process_hot_block(
            self.a.data,
            self.b.data,
            out32,
            self.a.width,
            start_x,
            start_y,
            end_x,
            end_y,
            self.max_delta,
            self.include_aa,
            self.draw_background,
            self.diff_color,
            self.diff_color_alt,
            self.aa_color,
            self.alpha as f32,
            self.a,
            self.b,
        )
    }
}

/// Pixels to skip before the first possible diff: all of them when the rows
/// are equal, otherwise a multiple of [`SKIP_GROUP`] (itself a multiple of 64).
#[inline]
fn equal_prefix(a: &[u32], b: &[u32]) -> usize {
    let groups = a.chunks_exact(SKIP_GROUP).zip(b.chunks_exact(SKIP_GROUP));
    let mut skipped = 0;
    for (ga, gb) in groups {
        if !group_equal(ga, gb) {
            return skipped;
        }
        skipped += SKIP_GROUP;
    }
    if group_equal(&a[skipped..], &b[skipped..]) {
        a.len()
    } else {
        skipped
    }
}

/// libc memcmp runs at memory speed; groups only bound how far a dirty row
/// gets rescanned.
#[cfg(not(target_arch = "wasm32"))]
const SKIP_GROUP: usize = 1024;

#[cfg(not(target_arch = "wasm32"))]
#[inline(always)]
fn group_equal(a: &[u32], b: &[u32]) -> bool {
    a == b
}

/// wasm32 has no vector memcmp (its `memcmp` is a byte loop), so OR the XOR
/// of 64 pixels and branch once.
#[cfg(target_arch = "wasm32")]
const SKIP_GROUP: usize = 64;

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline(always)]
fn group_equal(a: &[u32], b: &[u32]) -> bool {
    use std::arch::wasm32::*;

    if a.len() != SKIP_GROUP {
        return a.iter().zip(b).all(|(x, y)| x == y);
    }
    // SAFETY: both slices hold exactly SKIP_GROUP pixels.
    unsafe {
        let (pa, pb) = (a.as_ptr() as *const v128, b.as_ptr() as *const v128);
        let mut acc = [u32x4_splat(0); 4];
        for k in 0..SKIP_GROUP / 4 {
            let diff = v128_xor(v128_load(pa.add(k)), v128_load(pb.add(k)));
            acc[k % 4] = v128_or(acc[k % 4], diff);
        }
        !v128_any_true(v128_or(v128_or(acc[0], acc[1]), v128_or(acc[2], acc[3])))
    }
}

#[cfg(all(target_arch = "wasm32", not(target_feature = "simd128")))]
#[inline(always)]
fn group_equal(a: &[u32], b: &[u32]) -> bool {
    a.iter().zip(b).fold(0, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn expect_len(actual: usize, width: u32, height: u32) -> Result<(), DiffError> {
    let expected = width as usize * height as usize * 4;
    if actual != expected {
        return Err(DiffError::InvalidDataSize { expected, actual });
    }
    Ok(())
}

fn check_data_size(image: &Image) -> Result<(), DiffError> {
    let expected = image.width as usize * image.height as usize * 4;
    if image.data.len() != expected {
        return Err(DiffError::InvalidDataSize {
            expected,
            actual: image.data.len(),
        });
    }
    Ok(())
}

#[inline(always)]
pub(crate) fn compute_gray_pixel_f32(pixel: u32, alpha_scaled: f32) -> u8 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    let a = ((pixel >> 24) & 0xFF) as f32;

    let luminance = r * YIQ_Y_F32[0] + g * YIQ_Y_F32[1] + b * YIQ_Y_F32[2];
    let value = 255.0f32 + (luminance - 255.0f32) * alpha_scaled * a;

    value.clamp(0.0f32, 255.0f32) as u8
}

#[inline(always)]
pub(crate) fn pack_gray_pixel(gray: u8) -> u32 {
    (gray as u32) | ((gray as u32) << 8) | ((gray as u32) << 16) | 0xFF000000
}

#[inline(always)]
pub(crate) fn pack_color_pixel(color: &[u8; 3]) -> u32 {
    (color[0] as u32) | ((color[1] as u32) << 8) | ((color[2] as u32) << 16) | 0xFF000000
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yiq::pack_pixel;

    fn create_solid_image(width: u32, height: u32, color: u32) -> Image {
        let mut img = Image::new(width, height);
        for pixel in img.as_u32_mut() {
            *pixel = color;
        }
        img
    }

    #[test]
    fn test_identical_images() {
        let img1 = create_solid_image(100, 100, pack_pixel(255, 255, 255, 255));
        let img2 = create_solid_image(100, 100, pack_pixel(255, 255, 255, 255));
        let result = diff(&img1, &img2, None, &DiffOptions::default()).unwrap();
        assert_eq!(result.count(), Some(0));
        assert!(result.is_identical());
    }

    #[test]
    fn test_completely_different() {
        let img1 = create_solid_image(100, 100, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(100, 100, pack_pixel(255, 255, 255, 255));
        let options = DiffOptions {
            antialiasing: false,
            ..Default::default()
        };
        let result = diff(&img1, &img2, None, &options).unwrap();
        assert_eq!(result.count(), Some(10000));
        assert!(!result.is_identical());
    }

    #[test]
    fn test_size_mismatch() {
        let img1 = create_solid_image(100, 100, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(50, 50, pack_pixel(0, 0, 0, 255));
        let result = diff(&img1, &img2, None, &DiffOptions::default()).unwrap();
        assert_eq!(
            result,
            DiffResult::DimensionMismatch {
                a: Size {
                    width: 100,
                    height: 100
                },
                b: Size {
                    width: 50,
                    height: 50
                },
            }
        );
    }

    #[test]
    fn test_aa_excluded_from_count() {
        let img1 = create_solid_image(10, 10, pack_pixel(100, 100, 100, 255));
        let mut img2 = create_solid_image(10, 10, pack_pixel(100, 100, 100, 255));

        img2.as_u32_mut()[0] = pack_pixel(100, 100, 104, 255);
        img2.as_u32_mut()[1] = pack_pixel(100, 101, 100, 255);

        let options_no_aa = DiffOptions {
            antialiasing: true,
            threshold: 0.1,
            ..Default::default()
        };

        let result = diff(&img1, &img2, None, &options_no_aa).unwrap();
        assert!(
            result.count().unwrap() < 2,
            "AA pixels should be excluded from count, got {}",
            result.count().unwrap()
        );
    }

    #[test]
    fn test_no_aa_vs_aa_difference() {
        let img1 = create_solid_image(10, 10, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(10, 10, pack_pixel(255, 255, 255, 255));

        let options_with_aa = DiffOptions {
            antialiasing: false,
            threshold: 0.1,
            ..Default::default()
        };

        let options_without_aa = DiffOptions {
            antialiasing: true,
            threshold: 0.1,
            ..Default::default()
        };

        let result_with = diff(&img1, &img2, None, &options_with_aa).unwrap();
        let result_without = diff(&img1, &img2, None, &options_without_aa).unwrap();

        assert_eq!(
            result_with.count(),
            result_without.count(),
            "With same threshold, antialiasing should not affect diff count (it only affects output coloring)"
        );
    }
}
