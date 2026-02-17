//! Two-pass block-based image diff with SIMD acceleration.
//!
//! Cold pass: SIMD byte comparison to identify changed blocks, draw unchanged immediately.
//! Hot pass: YIQ perceptual delta with anti-aliasing detection on changed blocks only.
//!
//! SIMD: NEON (aarch64), AVX-512/AVX2/SSE4.1 (x86_64), scalar fallback (riscv64, others).

use crate::antialiasing::is_antialiased;
use crate::output::{clear_transparent, fill_block_gray_optimized};
use crate::types::{DiffError, DiffOptions, DiffResult, Image};
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
const INV_255: f32 = 1.0 / 255.0;

#[inline]
fn calculate_block_size(width: u32, height: u32) -> u32 {
    let area = (width as f64) * (height as f64);
    let scale = area.sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();
    let log2_val = raw_size.log2();
    (1u32 << (log2_val.round() as u32)).clamp(8, 128)
}

// =============================================================================
// Block perceptual diff detection (cold pass)
// =============================================================================

#[cfg(target_arch = "aarch64")]
#[inline]
fn block_has_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    block_has_perceptual_diff_neon(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(target_arch = "x86_64")]
#[inline]
fn block_has_perceptual_diff_with_features(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
    features: X86Features,
) -> bool {
    if features.has_avx2_fma {
        unsafe {
            block_has_perceptual_diff_avx2(
                a32, b32, width, start_x, start_y, end_x, end_y, max_delta,
            )
        }
    } else if features.has_sse41 {
        unsafe {
            block_has_perceptual_diff_sse(
                a32, b32, width, start_x, start_y, end_x, end_y, max_delta,
            )
        }
    } else {
        block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }
}

#[cfg(target_arch = "riscv64")]
#[inline]
fn block_has_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(not(any(
    target_arch = "aarch64",
    target_arch = "x86_64",
    target_arch = "riscv64"
)))]
#[inline]
fn block_has_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
}

#[cfg(target_arch = "aarch64")]
#[inline]
fn block_has_perceptual_diff_neon(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    use std::arch::aarch64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        unsafe {
            let a_ptr = a32.as_ptr().add(row_start);
            let b_ptr = b32.as_ptr().add(row_start);

            while offset + 4 <= row_width {
                let va = vld1q_u32(a_ptr.add(offset));
                let vb = vld1q_u32(b_ptr.add(offset));
                let cmp = vceqq_u32(va, vb);
                let not_cmp = vmvnq_u32(cmp);

                if vmaxvq_u32(not_cmp) != 0 {
                    // At least one pixel differs - check with SIMD YIQ
                    let deltas = yiq_delta_4_neon_direct(va, vb);
                    let max_vec = vdupq_n_f32(max_delta);
                    let abs_deltas = vabsq_f32(deltas);
                    let exceeds = vcgtq_f32(abs_deltas, max_vec);
                    if vmaxvq_u32(vreinterpretq_u32_f32(vreinterpretq_f32_u32(exceeds))) != 0 {
                        return true;
                    }
                }
                offset += 4;
            }
        }

        // Scalar remainder
        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_f32(pa, pb).abs() > max_delta {
                return true;
            }
        }
    }
    false
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn block_has_perceptual_diff_avx2(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    use std::arch::x86_64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        let a_ptr = a32.as_ptr().add(row_start);
        let b_ptr = b32.as_ptr().add(row_start);

        // Process 8 pixels at a time with AVX2
        while offset + 8 <= row_width {
            let va = _mm256_loadu_si256(a_ptr.add(offset) as *const __m256i);
            let vb = _mm256_loadu_si256(b_ptr.add(offset) as *const __m256i);
            let cmp = _mm256_cmpeq_epi32(va, vb);
            let mask = _mm256_movemask_ps(_mm256_castsi256_ps(cmp));

            if mask != 0xFF {
                // At least one pixel differs - compute YIQ deltas
                let deltas = yiq_delta_8_avx2_direct(va, vb);
                let max_vec = _mm256_set1_ps(max_delta);
                let abs_mask = _mm256_castsi256_ps(_mm256_set1_epi32(0x7FFFFFFF));
                let abs_deltas = _mm256_and_ps(deltas, abs_mask);
                let exceeds = _mm256_cmp_ps(abs_deltas, max_vec, _CMP_GT_OQ);
                if _mm256_movemask_ps(exceeds) != 0 {
                    return true;
                }
            }
            offset += 8;
        }

        // SSE4.1 for 4-pixel chunks
        while offset + 4 <= row_width {
            let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
            let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
            let cmp = _mm_cmpeq_epi32(va, vb);
            let mask = _mm_movemask_epi8(cmp);

            if mask != 0xFFFF {
                let deltas = yiq_delta_4_sse_direct(va, vb);
                let max_vec = _mm_set1_ps(max_delta);
                let abs_mask = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
                let abs_deltas = _mm_and_ps(deltas, abs_mask);
                let exceeds = _mm_cmpgt_ps(abs_deltas, max_vec);
                if _mm_movemask_ps(exceeds) != 0 {
                    return true;
                }
            }
            offset += 4;
        }

        // Scalar remainder
        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_f32(pa, pb).abs() > max_delta {
                return true;
            }
        }
    }
    false
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn block_has_perceptual_diff_sse(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    use std::arch::x86_64::*;

    let row_width = (end_x - start_x) as usize;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let mut offset = 0;

        let a_ptr = a32.as_ptr().add(row_start);
        let b_ptr = b32.as_ptr().add(row_start);

        while offset + 4 <= row_width {
            let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
            let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
            let cmp = _mm_cmpeq_epi32(va, vb);
            let mask = _mm_movemask_epi8(cmp);

            if mask != 0xFFFF {
                let deltas = yiq_delta_4_sse_direct(va, vb);
                let max_vec = _mm_set1_ps(max_delta);
                let abs_mask = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
                let abs_deltas = _mm_and_ps(deltas, abs_mask);
                let exceeds = _mm_cmpgt_ps(abs_deltas, max_vec);
                if _mm_movemask_ps(exceeds) != 0 {
                    return true;
                }
            }
            offset += 4;
        }

        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_f32(pa, pb).abs() > max_delta {
                return true;
            }
        }
    }
    false
}

#[cfg(not(target_arch = "aarch64"))]
#[inline]
fn block_has_perceptual_diff_scalar(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    for y in start_y..end_y {
        for x in start_x..end_x {
            let idx = (y * width + x) as usize;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta_f32(pa, pb).abs() > max_delta {
                return true;
            }
        }
    }
    false
}

// =============================================================================
// SIMD YIQ Delta - Pure SIMD RGB extraction (no scalar loops)
// =============================================================================

/// NEON: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD with alpha handling
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon_direct(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
) -> std::arch::aarch64::float32x4_t {
    use std::arch::aarch64::*;

    let mask_ff = vdupq_n_u32(0xFF);
    let v255 = vdupq_n_f32(255.0);
    let inv255 = vdupq_n_f32(INV_255);

    let r_a = vandq_u32(va, mask_ff);
    let g_a = vandq_u32(vshrq_n_u32(va, 8), mask_ff);
    let b_a = vandq_u32(vshrq_n_u32(va, 16), mask_ff);
    let a_a = vshrq_n_u32(va, 24);

    let r_b = vandq_u32(vb, mask_ff);
    let g_b = vandq_u32(vshrq_n_u32(vb, 8), mask_ff);
    let b_b = vandq_u32(vshrq_n_u32(vb, 16), mask_ff);
    let a_b = vshrq_n_u32(vb, 24);

    let r_a_f = vcvtq_f32_u32(r_a);
    let g_a_f = vcvtq_f32_u32(g_a);
    let b_a_f = vcvtq_f32_u32(b_a);
    let a_a_f = vcvtq_f32_u32(a_a);

    let r_b_f = vcvtq_f32_u32(r_b);
    let g_b_f = vcvtq_f32_u32(g_b);
    let b_b_f = vcvtq_f32_u32(b_b);
    let a_b_f = vcvtq_f32_u32(a_b);

    let alpha_norm_a = vmulq_f32(a_a_f, inv255);
    let alpha_norm_b = vmulq_f32(a_b_f, inv255);

    let br_a = vfmaq_f32(v255, vsubq_f32(r_a_f, v255), alpha_norm_a);
    let bg_a = vfmaq_f32(v255, vsubq_f32(g_a_f, v255), alpha_norm_a);
    let bb_a = vfmaq_f32(v255, vsubq_f32(b_a_f, v255), alpha_norm_a);

    let br_b = vfmaq_f32(v255, vsubq_f32(r_b_f, v255), alpha_norm_b);
    let bg_b = vfmaq_f32(v255, vsubq_f32(g_b_f, v255), alpha_norm_b);
    let bb_b = vfmaq_f32(v255, vsubq_f32(b_b_f, v255), alpha_norm_b);

    let dr = vsubq_f32(br_a, br_b);
    let dg = vsubq_f32(bg_a, bg_b);
    let db = vsubq_f32(bb_a, bb_b);

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

/// SSE4.1: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD with alpha handling
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn yiq_delta_4_sse_direct(
    va: std::arch::x86_64::__m128i,
    vb: std::arch::x86_64::__m128i,
) -> std::arch::x86_64::__m128 {
    use std::arch::x86_64::*;

    let mask_ff = _mm_set1_epi32(0xFF);

    let r_a = _mm_and_si128(va, mask_ff);
    let g_a = _mm_and_si128(_mm_srli_epi32(va, 8), mask_ff);
    let b_a = _mm_and_si128(_mm_srli_epi32(va, 16), mask_ff);
    let a_a = _mm_srli_epi32(va, 24);

    let r_b = _mm_and_si128(vb, mask_ff);
    let g_b = _mm_and_si128(_mm_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm_and_si128(_mm_srli_epi32(vb, 16), mask_ff);
    let a_b = _mm_srli_epi32(vb, 24);

    let r_a_f = _mm_cvtepi32_ps(r_a);
    let g_a_f = _mm_cvtepi32_ps(g_a);
    let b_a_f = _mm_cvtepi32_ps(b_a);
    let a_a_f = _mm_cvtepi32_ps(a_a);

    let r_b_f = _mm_cvtepi32_ps(r_b);
    let g_b_f = _mm_cvtepi32_ps(g_b);
    let b_b_f = _mm_cvtepi32_ps(b_b);
    let a_b_f = _mm_cvtepi32_ps(a_b);

    let v255 = _mm_set1_ps(255.0);
    let inv255 = _mm_set1_ps(INV_255);

    let alpha_norm_a = _mm_mul_ps(a_a_f, inv255);
    let alpha_norm_b = _mm_mul_ps(a_b_f, inv255);

    let br_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(r_a_f, v255), alpha_norm_a));
    let bg_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(g_a_f, v255), alpha_norm_a));
    let bb_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(b_a_f, v255), alpha_norm_a));

    let br_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(r_b_f, v255), alpha_norm_b));
    let bg_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(g_b_f, v255), alpha_norm_b));
    let bb_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(b_b_f, v255), alpha_norm_b));

    let dr = _mm_sub_ps(br_a, br_b);
    let dg = _mm_sub_ps(bg_a, bg_b);
    let db = _mm_sub_ps(bb_a, bb_b);

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
unsafe fn yiq_delta_8_avx2_direct(
    va: std::arch::x86_64::__m256i,
    vb: std::arch::x86_64::__m256i,
) -> std::arch::x86_64::__m256 {
    use std::arch::x86_64::*;

    let mask_ff = _mm256_set1_epi32(0xFF);

    let r_a = _mm256_and_si256(va, mask_ff);
    let g_a = _mm256_and_si256(_mm256_srli_epi32(va, 8), mask_ff);
    let b_a = _mm256_and_si256(_mm256_srli_epi32(va, 16), mask_ff);
    let a_a = _mm256_srli_epi32(va, 24);

    let r_b = _mm256_and_si256(vb, mask_ff);
    let g_b = _mm256_and_si256(_mm256_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm256_and_si256(_mm256_srli_epi32(vb, 16), mask_ff);
    let a_b = _mm256_srli_epi32(vb, 24);

    let r_a_f = _mm256_cvtepi32_ps(r_a);
    let g_a_f = _mm256_cvtepi32_ps(g_a);
    let b_a_f = _mm256_cvtepi32_ps(b_a);
    let a_a_f = _mm256_cvtepi32_ps(a_a);

    let r_b_f = _mm256_cvtepi32_ps(r_b);
    let g_b_f = _mm256_cvtepi32_ps(g_b);
    let b_b_f = _mm256_cvtepi32_ps(b_b);
    let a_b_f = _mm256_cvtepi32_ps(a_b);

    let v255 = _mm256_set1_ps(255.0);
    let inv255 = _mm256_set1_ps(INV_255);

    let alpha_norm_a = _mm256_mul_ps(a_a_f, inv255);
    let alpha_norm_b = _mm256_mul_ps(a_b_f, inv255);

    let br_a = _mm256_fmadd_ps(_mm256_sub_ps(r_a_f, v255), alpha_norm_a, v255);
    let bg_a = _mm256_fmadd_ps(_mm256_sub_ps(g_a_f, v255), alpha_norm_a, v255);
    let bb_a = _mm256_fmadd_ps(_mm256_sub_ps(b_a_f, v255), alpha_norm_a, v255);

    let br_b = _mm256_fmadd_ps(_mm256_sub_ps(r_b_f, v255), alpha_norm_b, v255);
    let bg_b = _mm256_fmadd_ps(_mm256_sub_ps(g_b_f, v255), alpha_norm_b, v255);
    let bb_b = _mm256_fmadd_ps(_mm256_sub_ps(b_b_f, v255), alpha_norm_b, v255);

    let dr = _mm256_sub_ps(br_a, br_b);
    let dg = _mm256_sub_ps(bg_a, bg_b);
    let db = _mm256_sub_ps(bb_a, bb_b);

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

/// Scalar f32 YIQ delta (handles alpha)
#[inline(always)]
fn color_delta_f32(pixel_a: u32, pixel_b: u32) -> f32 {
    if pixel_a == pixel_b {
        return 0.0;
    }

    let r1 = (pixel_a & 0xFF) as f32;
    let g1 = ((pixel_a >> 8) & 0xFF) as f32;
    let b1 = ((pixel_a >> 16) & 0xFF) as f32;
    let a1 = ((pixel_a >> 24) & 0xFF) as f32;

    let r2 = (pixel_b & 0xFF) as f32;
    let g2 = ((pixel_b >> 8) & 0xFF) as f32;
    let b2 = ((pixel_b >> 16) & 0xFF) as f32;
    let a2 = ((pixel_b >> 24) & 0xFF) as f32;

    let (dr, dg, db) = if a1 >= 255.0 && a2 >= 255.0 {
        (r1 - r2, g1 - g2, b1 - b2)
    } else {
        let inv255 = 1.0 / 255.0;
        let br1 = 255.0 + (r1 - 255.0) * a1 * inv255;
        let bg1 = 255.0 + (g1 - 255.0) * a1 * inv255;
        let bb1 = 255.0 + (b1 - 255.0) * a1 * inv255;
        let br2 = 255.0 + (r2 - 255.0) * a2 * inv255;
        let bg2 = 255.0 + (g2 - 255.0) * a2 * inv255;
        let bb2 = 255.0 + (b2 - 255.0) * a2 * inv255;
        (br1 - br2, bg1 - bg2, bb1 - bb2)
    };

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
    image1: &Image,
    image2: &Image,
) -> u32 {
    process_hot_block_neon(
        a32, b32, out32, width, start_x, start_y, end_x, end_y,
        max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
        alpha_f32, image1, image2,
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
    image1: &Image,
    image2: &Image,
    features: X86Features,
) -> u32 {
    if features.has_avx2_fma {
        unsafe {
            process_hot_block_avx2(
                a32, b32, out32, width, start_x, start_y, end_x, end_y,
                max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                alpha_f32, image1, image2,
            )
        }
    } else if features.has_sse41 {
        unsafe {
            process_hot_block_sse(
                a32, b32, out32, width, start_x, start_y, end_x, end_y,
                max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                alpha_f32, image1, image2,
            )
        }
    } else {
        process_hot_block_scalar(
            a32, b32, out32, width, start_x, start_y, end_x, end_y,
            max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
            alpha_f32, image1, image2,
        )
    }
}

/// Process a block of changed pixels (scalar fallback)
#[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
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
    image1: &Image,
    image2: &Image,
) -> u32 {
    process_hot_block_scalar(
        a32, b32, out32, width, start_x, start_y, end_x, end_y,
        max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
        alpha_f32, image1, image2,
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
    image1: &Image,
    image2: &Image,
) -> u32 {
    use std::arch::aarch64::*;

    let mut diff_count = 0u32;
    let inv_255 = 1.0 / 255.0;
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
                    let deltas = yiq_delta_4_neon_signed(va, vb, mask_ff);
                    let abs_deltas = vabsq_f32(deltas);
                    let exceeds = vcgtq_f32(abs_deltas, max_delta_vec);

                    let mut delta_arr: [f32; 4] = [0.0f32; 4];
                    let mut pa_arr: [u32; 4] = [0u32; 4];
                    let mut pb_arr: [u32; 4] = [0u32; 4];
                    vst1q_f32(delta_arr.as_mut_ptr(), deltas);
                    vst1q_u32(pa_arr.as_mut_ptr(), va);
                    vst1q_u32(pb_arr.as_mut_ptr(), vb);

                    let any_exceeds = vmaxvq_u32(exceeds) != 0;

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
                        } else if any_exceeds {
                            let lane_exceeds = match i {
                                0 => vgetq_lane_u32(exceeds, 0),
                                1 => vgetq_lane_u32(exceeds, 1),
                                2 => vgetq_lane_u32(exceeds, 2),
                                _ => vgetq_lane_u32(exceeds, 3),
                            };
                            if lane_exceeds != 0 {
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
                let delta = color_delta_f32(pa, pb);
                if delta.abs() > max_delta {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta,
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

/// NEON: YIQ delta with sign for 4 pixels (with alpha handling)
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon_signed(
    va: std::arch::aarch64::uint32x4_t,
    vb: std::arch::aarch64::uint32x4_t,
    mask_ff: std::arch::aarch64::uint32x4_t,
) -> std::arch::aarch64::float32x4_t {
    use std::arch::aarch64::*;

    let v255 = vdupq_n_f32(255.0);
    let inv255 = vdupq_n_f32(INV_255);

    let r_a = vandq_u32(va, mask_ff);
    let g_a = vandq_u32(vshrq_n_u32(va, 8), mask_ff);
    let b_a = vandq_u32(vshrq_n_u32(va, 16), mask_ff);
    let a_a = vshrq_n_u32(va, 24);

    let r_b = vandq_u32(vb, mask_ff);
    let g_b = vandq_u32(vshrq_n_u32(vb, 8), mask_ff);
    let b_b = vandq_u32(vshrq_n_u32(vb, 16), mask_ff);
    let a_b = vshrq_n_u32(vb, 24);

    let r_a_f = vcvtq_f32_u32(r_a);
    let g_a_f = vcvtq_f32_u32(g_a);
    let b_a_f = vcvtq_f32_u32(b_a);
    let a_a_f = vcvtq_f32_u32(a_a);

    let r_b_f = vcvtq_f32_u32(r_b);
    let g_b_f = vcvtq_f32_u32(g_b);
    let b_b_f = vcvtq_f32_u32(b_b);
    let a_b_f = vcvtq_f32_u32(a_b);

    let alpha_norm_a = vmulq_f32(a_a_f, inv255);
    let alpha_norm_b = vmulq_f32(a_b_f, inv255);

    let br_a = vfmaq_f32(v255, vsubq_f32(r_a_f, v255), alpha_norm_a);
    let bg_a = vfmaq_f32(v255, vsubq_f32(g_a_f, v255), alpha_norm_a);
    let bb_a = vfmaq_f32(v255, vsubq_f32(b_a_f, v255), alpha_norm_a);

    let br_b = vfmaq_f32(v255, vsubq_f32(r_b_f, v255), alpha_norm_b);
    let bg_b = vfmaq_f32(v255, vsubq_f32(g_b_f, v255), alpha_norm_b);
    let bb_b = vfmaq_f32(v255, vsubq_f32(b_b_f, v255), alpha_norm_b);

    let dr = vsubq_f32(br_a, br_b);
    let dg = vsubq_f32(bg_a, bg_b);
    let db = vsubq_f32(bb_a, bb_b);

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
    image1: &Image,
    image2: &Image,
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
                let deltas = yiq_delta_8_avx2_signed(va, vb, mask_ff, v255, zero);
                let abs_mask = _mm256_castsi256_ps(_mm256_set1_epi32(0x7FFFFFFF));
                let abs_deltas = _mm256_and_ps(deltas, abs_mask);
                let exceeds = _mm256_cmp_ps(abs_deltas, max_delta_vec, _CMP_GT_OQ);
                let exceeds_mask = _mm256_movemask_ps(exceeds) as u8;

                let mut delta_arr: [f32; 8] = [0.0f32; 8];
                let mut pa_arr: [u32; 8] = [0u32; 8];
                let mut pb_arr: [u32; 8] = [0u32; 8];
                _mm256_storeu_ps(delta_arr.as_mut_ptr(), deltas);
                _mm256_storeu_si256(pa_arr.as_mut_ptr() as *mut __m256i, va);
                _mm256_storeu_si256(pb_arr.as_mut_ptr() as *mut __m256i, vb);

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
                    } else if (exceeds_mask >> i) & 1 != 0 {
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
                let delta = color_delta_f32(pa, pb);
                if delta.abs() > max_delta {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta,
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
    let gray_u32 = _mm256_cvtps_epi32(gray_clamped);

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
unsafe fn yiq_delta_8_avx2_signed(
    va: std::arch::x86_64::__m256i,
    vb: std::arch::x86_64::__m256i,
    mask_ff: std::arch::x86_64::__m256i,
    _v255: std::arch::x86_64::__m256,
    zero: std::arch::x86_64::__m256,
) -> std::arch::x86_64::__m256 {
    use std::arch::x86_64::*;

    let v255 = _mm256_set1_ps(255.0);
    let inv255 = _mm256_set1_ps(INV_255);

    let r_a = _mm256_and_si256(va, mask_ff);
    let g_a = _mm256_and_si256(_mm256_srli_epi32(va, 8), mask_ff);
    let b_a = _mm256_and_si256(_mm256_srli_epi32(va, 16), mask_ff);
    let a_a = _mm256_srli_epi32(va, 24);

    let r_b = _mm256_and_si256(vb, mask_ff);
    let g_b = _mm256_and_si256(_mm256_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm256_and_si256(_mm256_srli_epi32(vb, 16), mask_ff);
    let a_b = _mm256_srli_epi32(vb, 24);

    let r_a_f = _mm256_cvtepi32_ps(r_a);
    let g_a_f = _mm256_cvtepi32_ps(g_a);
    let b_a_f = _mm256_cvtepi32_ps(b_a);
    let a_a_f = _mm256_cvtepi32_ps(a_a);

    let r_b_f = _mm256_cvtepi32_ps(r_b);
    let g_b_f = _mm256_cvtepi32_ps(g_b);
    let b_b_f = _mm256_cvtepi32_ps(b_b);
    let a_b_f = _mm256_cvtepi32_ps(a_b);

    let alpha_norm_a = _mm256_mul_ps(a_a_f, inv255);
    let alpha_norm_b = _mm256_mul_ps(a_b_f, inv255);

    let br_a = _mm256_fmadd_ps(_mm256_sub_ps(r_a_f, v255), alpha_norm_a, v255);
    let bg_a = _mm256_fmadd_ps(_mm256_sub_ps(g_a_f, v255), alpha_norm_a, v255);
    let bb_a = _mm256_fmadd_ps(_mm256_sub_ps(b_a_f, v255), alpha_norm_a, v255);

    let br_b = _mm256_fmadd_ps(_mm256_sub_ps(r_b_f, v255), alpha_norm_b, v255);
    let bg_b = _mm256_fmadd_ps(_mm256_sub_ps(g_b_f, v255), alpha_norm_b, v255);
    let bb_b = _mm256_fmadd_ps(_mm256_sub_ps(b_b_f, v255), alpha_norm_b, v255);

    let dr = _mm256_sub_ps(br_a, br_b);
    let dg = _mm256_sub_ps(bg_a, bg_b);
    let db = _mm256_sub_ps(bb_a, bb_b);

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
    image1: &Image,
    image2: &Image,
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
                let delta = color_delta_f32(pa, pb);
                if delta.abs() > max_delta {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta,
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
    image1: &Image,
    image2: &Image,
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
        let deltas = yiq_delta_4_sse_signed(va, vb, mask_ff, zero);
        let max_delta_vec = _mm_set1_ps(max_delta);
        let abs_mask = _mm_castsi128_ps(_mm_set1_epi32(0x7FFFFFFF));
        let abs_deltas = _mm_and_ps(deltas, abs_mask);
        let exceeds = _mm_cmpgt_ps(abs_deltas, max_delta_vec);
        let exceeds_mask = _mm_movemask_ps(exceeds) as u8;

        let mut delta_arr: [f32; 4] = [0.0f32; 4];
        let mut pa_arr: [u32; 4] = [0u32; 4];
        let mut pb_arr: [u32; 4] = [0u32; 4];
        _mm_storeu_ps(delta_arr.as_mut_ptr(), deltas);
        _mm_storeu_si128(pa_arr.as_mut_ptr() as *mut __m128i, va);
        _mm_storeu_si128(pb_arr.as_mut_ptr() as *mut __m128i, vb);

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
            } else if (exceeds_mask >> i) & 1 != 0 {
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
    let gray_u32 = _mm_cvtps_epi32(gray_clamped);

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
unsafe fn yiq_delta_4_sse_signed(
    va: std::arch::x86_64::__m128i,
    vb: std::arch::x86_64::__m128i,
    mask_ff: std::arch::x86_64::__m128i,
    zero: std::arch::x86_64::__m128,
) -> std::arch::x86_64::__m128 {
    use std::arch::x86_64::*;

    let v255 = _mm_set1_ps(255.0);
    let inv255 = _mm_set1_ps(INV_255);

    let r_a = _mm_and_si128(va, mask_ff);
    let g_a = _mm_and_si128(_mm_srli_epi32(va, 8), mask_ff);
    let b_a = _mm_and_si128(_mm_srli_epi32(va, 16), mask_ff);
    let a_a = _mm_srli_epi32(va, 24);

    let r_b = _mm_and_si128(vb, mask_ff);
    let g_b = _mm_and_si128(_mm_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm_and_si128(_mm_srli_epi32(vb, 16), mask_ff);
    let a_b = _mm_srli_epi32(vb, 24);

    let r_a_f = _mm_cvtepi32_ps(r_a);
    let g_a_f = _mm_cvtepi32_ps(g_a);
    let b_a_f = _mm_cvtepi32_ps(b_a);
    let a_a_f = _mm_cvtepi32_ps(a_a);

    let r_b_f = _mm_cvtepi32_ps(r_b);
    let g_b_f = _mm_cvtepi32_ps(g_b);
    let b_b_f = _mm_cvtepi32_ps(b_b);
    let a_b_f = _mm_cvtepi32_ps(a_b);

    let alpha_norm_a = _mm_mul_ps(a_a_f, inv255);
    let alpha_norm_b = _mm_mul_ps(a_b_f, inv255);

    let br_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(r_a_f, v255), alpha_norm_a));
    let bg_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(g_a_f, v255), alpha_norm_a));
    let bb_a = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(b_a_f, v255), alpha_norm_a));

    let br_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(r_b_f, v255), alpha_norm_b));
    let bg_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(g_b_f, v255), alpha_norm_b));
    let bb_b = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(b_b_f, v255), alpha_norm_b));

    let dr = _mm_sub_ps(br_a, br_b);
    let dg = _mm_sub_ps(bg_a, bg_b);
    let db = _mm_sub_ps(bb_a, bb_b);

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
    image1: &Image,
    image2: &Image,
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
                let delta = color_delta_f32(pa, pb);
                if delta.abs() > max_delta {
                    diff_count += process_diff_pixel(
                        pixel_index,
                        delta,
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
    image1: &Image,
    image2: &Image,
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
        let is_aa = is_antialiased(image1, image2, x, y) || is_antialiased(image2, image1, x, y);
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
pub fn diff(
    image1: &Image,
    image2: &Image,
    mut output: Option<&mut Image>,
    options: &DiffOptions,
) -> Result<DiffResult, DiffError> {
    if image1.width != image2.width || image1.height != image2.height {
        return Err(DiffError::SizeMismatch {
            img1_width: image1.width,
            img1_height: image1.height,
            img2_width: image2.width,
            img2_height: image2.height,
        });
    }

    let (width, height) = (image1.width, image1.height);
    let total_pixels = width * height;

    if let Some(ref mut out) = output {
        if options.diff_mask {
            clear_transparent(out);
        }
    }

    if image1.data.as_ptr() == image2.data.as_ptr() {
        if let Some(ref mut out) = output {
            if !options.diff_mask {
                fill_block_gray_optimized(image1, out, options.alpha, 0, 0, width, height);
            }
        }
        return Ok(DiffResult::new(0, total_pixels));
    }

    let block_size = calculate_block_size(width, height);
    let blocks_x = (width + block_size - 1) / block_size;
    let blocks_y = (height + block_size - 1) / block_size;

    let a32 = image1.as_u32();
    let b32 = image2.as_u32();
    let max_delta = threshold_to_max_delta_f32(options.threshold);
    let draw_background = output.is_some() && !options.diff_mask;
    let include_aa = options.include_aa;
    let alpha_f32 = options.alpha as f32;

    let diff_color = pack_color_pixel(&options.diff_color);
    let diff_color_alt = pack_color_pixel(
        options
            .diff_color_alt
            .as_ref()
            .unwrap_or(&options.diff_color),
    );
    let aa_color = pack_color_pixel(&options.aa_color);

    let estimated_changed_blocks = ((blocks_x * blocks_y) as usize / 8).max(16);
    let mut changed_blocks: Vec<(u32, u32, u32, u32)> =
        Vec::with_capacity(estimated_changed_blocks);

    // Detect CPU features once (x86_64 only)
    #[cfg(target_arch = "x86_64")]
    let features = X86Features::detect();

    // Cold pass: identify changed blocks
    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let start_x = bx * block_size;
            let start_y = by * block_size;
            let end_x = (start_x + block_size).min(width);
            let end_y = (start_y + block_size).min(height);

            #[cfg(target_arch = "x86_64")]
            let has_diff = block_has_perceptual_diff_with_features(
                a32, b32, width, start_x, start_y, end_x, end_y, max_delta, features,
            );
            #[cfg(not(target_arch = "x86_64"))]
            let has_diff = block_has_perceptual_diff(
                a32, b32, width, start_x, start_y, end_x, end_y, max_delta,
            );

            if has_diff {
                changed_blocks.push((start_x, start_y, end_x, end_y));
            } else if let Some(ref mut out) = output {
                if !options.diff_mask {
                    fill_block_gray_optimized(
                        image1, out, options.alpha, start_x, start_y, end_x, end_y,
                    );
                }
            }
        }
    }

    if changed_blocks.is_empty() {
        return Ok(DiffResult::new(0, total_pixels));
    }

    // Hot pass: process changed blocks with SIMD
    #[cfg(target_arch = "x86_64")]
    let diff_count: u32 = if let Some(ref mut out) = output {
        let out32 = out.as_u32_mut();
        changed_blocks
            .iter()
            .map(|&(start_x, start_y, end_x, end_y)| {
                process_hot_block_with_features(
                    a32, b32, Some(out32), width, start_x, start_y, end_x, end_y,
                    max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                    alpha_f32, image1, image2, features,
                )
            })
            .sum()
    } else {
        changed_blocks
            .iter()
            .map(|&(start_x, start_y, end_x, end_y)| {
                process_hot_block_with_features(
                    a32, b32, None, width, start_x, start_y, end_x, end_y,
                    max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                    alpha_f32, image1, image2, features,
                )
            })
            .sum()
    };

    #[cfg(not(target_arch = "x86_64"))]
    let diff_count: u32 = if let Some(ref mut out) = output {
        let out32 = out.as_u32_mut();
        changed_blocks
            .iter()
            .map(|&(start_x, start_y, end_x, end_y)| {
                process_hot_block(
                    a32, b32, Some(out32), width, start_x, start_y, end_x, end_y,
                    max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                    alpha_f32, image1, image2,
                )
            })
            .sum()
    } else {
        changed_blocks
            .iter()
            .map(|&(start_x, start_y, end_x, end_y)| {
                process_hot_block(
                    a32, b32, None, width, start_x, start_y, end_x, end_y,
                    max_delta, include_aa, draw_background, diff_color, diff_color_alt, aa_color,
                    alpha_f32, image1, image2,
                )
            })
            .sum()
    };

    Ok(DiffResult::new(diff_count, total_pixels))
}

#[inline(always)]
fn compute_gray_pixel_f32(pixel: u32, alpha_scaled: f32) -> u8 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    let a = ((pixel >> 24) & 0xFF) as f32;

    let luminance = r * YIQ_Y_F32[0] + g * YIQ_Y_F32[1] + b * YIQ_Y_F32[2];
    let value = 255.0f32 + (luminance - 255.0f32) * alpha_scaled * a;

    value.clamp(0.0f32, 255.0f32) as u8
}

#[inline(always)]
fn pack_gray_pixel(gray: u8) -> u32 {
    (gray as u32) | ((gray as u32) << 8) | ((gray as u32) << 16) | 0xFF000000
}

#[inline(always)]
fn pack_color_pixel(color: &[u8; 3]) -> u32 {
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
        assert_eq!(result.diff_count, 0);
        assert!(result.identical);
    }

    #[test]
    fn test_completely_different() {
        let img1 = create_solid_image(100, 100, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(100, 100, pack_pixel(255, 255, 255, 255));
        let options = DiffOptions {
            include_aa: true,
            ..Default::default()
        };
        let result = diff(&img1, &img2, None, &options).unwrap();
        assert_eq!(result.diff_count, 10000);
        assert!(!result.identical);
    }

    #[test]
    fn test_size_mismatch() {
        let img1 = create_solid_image(100, 100, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(50, 50, pack_pixel(0, 0, 0, 255));
        let result = diff(&img1, &img2, None, &DiffOptions::default());
        assert!(matches!(result, Err(DiffError::SizeMismatch { .. })));
    }

    #[test]
    fn test_aa_excluded_from_count() {
        let img1 = create_solid_image(10, 10, pack_pixel(100, 100, 100, 255));
        let mut img2 = create_solid_image(10, 10, pack_pixel(100, 100, 100, 255));

        img2.as_u32_mut()[0] = pack_pixel(100, 100, 104, 255);
        img2.as_u32_mut()[1] = pack_pixel(100, 101, 100, 255);

        let options_no_aa = DiffOptions {
            include_aa: false,
            threshold: 0.1,
            ..Default::default()
        };

        let result = diff(&img1, &img2, None, &options_no_aa).unwrap();
        assert!(
            result.diff_count < 2,
            "AA pixels should be excluded from count, got {}",
            result.diff_count
        );
    }

    #[test]
    fn test_no_aa_vs_aa_difference() {
        let img1 = create_solid_image(10, 10, pack_pixel(0, 0, 0, 255));
        let img2 = create_solid_image(10, 10, pack_pixel(255, 255, 255, 255));

        let options_with_aa = DiffOptions {
            include_aa: true,
            threshold: 0.1,
            ..Default::default()
        };

        let options_without_aa = DiffOptions {
            include_aa: false,
            threshold: 0.1,
            ..Default::default()
        };

        let result_with = diff(&img1, &img2, None, &options_with_aa).unwrap();
        let result_without = diff(&img1, &img2, None, &options_without_aa).unwrap();

        assert_eq!(result_with.diff_count, result_without.diff_count, 
            "With same threshold, include_aa should not affect diff count (it only affects output coloring)");
    }
}
