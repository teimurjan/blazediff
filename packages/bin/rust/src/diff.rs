//! Two-pass block-based image diff with SIMD acceleration.
//!
//! Cold pass: SIMD byte comparison to identify changed blocks, draw unchanged immediately.
//! Hot pass: YIQ perceptual delta with anti-aliasing detection on changed blocks only.
//!
//! SIMD: NEON (aarch64), AVX2/SSE4.1 (x86_64), scalar fallback (riscv64, others).

use crate::antialiasing::is_antialiased;
use crate::output::{clear_transparent, draw_gray_pixel_u32, draw_pixel_u32, fill_block_gray};
use crate::types::{DiffError, DiffOptions, DiffResult, Image};
use crate::yiq::{color_delta_f32, threshold_to_max_delta_f32};

// f32 YIQ coefficients for SIMD hot paths
const YIQ_Y_F32: [f32; 3] = [0.29889531, 0.58662247, 0.11448223];
const YIQ_I_F32: [f32; 3] = [0.59597799, -0.2741761, -0.32180189];
const YIQ_Q_F32: [f32; 3] = [0.21147017, -0.52261711, 0.31114694];
const YIQ_WEIGHTS_F32: [f32; 3] = [0.5053, 0.299, 0.1957];

#[inline]
fn calculate_block_size(width: u32, height: u32) -> u32 {
    let area = (width as f64) * (height as f64);
    let scale = area.sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();
    let log2_val = raw_size.log2();
    (1u32 << (log2_val.round() as u32)).clamp(8, 128)
}

#[inline]
fn process_pixel_f32(
    image1: &Image,
    image2: &Image,
    pixel_a: u32,
    pixel_b: u32,
    pixel_index: usize,
    x: u32,
    y: u32,
    delta: f32,
    max_delta: f32,
    options: &DiffOptions,
    output: Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    if pixel_a == pixel_b {
        if draw_background {
            if let Some(out) = output {
                draw_gray_pixel_u32(image1, pixel_index, options.alpha, out);
            }
        }
        return 0;
    }

    if delta.abs() > max_delta {
        let is_aa = !options.include_aa
            && (is_antialiased(image1, image2, x, y) || is_antialiased(image2, image1, x, y));

        if is_aa {
            if draw_background {
                if let Some(out) = output {
                    draw_pixel_u32(out, pixel_index, &options.aa_color);
                }
            }
            0
        } else {
            if let Some(out) = output {
                let color = if delta < 0.0 {
                    options.diff_color_alt.as_ref().unwrap_or(&options.diff_color)
                } else {
                    &options.diff_color
                };
                draw_pixel_u32(out, pixel_index, color);
            }
            1
        }
    } else {
        if draw_background {
            if let Some(out) = output {
                draw_gray_pixel_u32(image1, pixel_index, options.alpha, out);
            }
        }
        0
    }
}

// =============================================================================
// Block perceptual diff detection (cold pass)
// =============================================================================

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
    #[cfg(target_arch = "aarch64")]
    {
        block_has_perceptual_diff_neon(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }

    #[cfg(target_arch = "x86_64")]
    {
        // Static dispatch at compile time - no runtime check in hot loop
        block_has_perceptual_diff_x86(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }

    #[cfg(target_arch = "riscv64")]
    {
        block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }

    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64", target_arch = "riscv64")))]
    {
        block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }
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
#[inline]
fn block_has_perceptual_diff_x86(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f32,
) -> bool {
    // Check AVX2 once at function entry, not per iteration
    if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
        unsafe {
            block_has_perceptual_diff_avx2(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
        }
    } else if is_x86_feature_detected!("sse4.1") {
        unsafe {
            block_has_perceptual_diff_sse(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
        }
    } else {
        block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }
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

/// NEON: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD
#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon_direct(va: std::arch::aarch64::uint32x4_t, vb: std::arch::aarch64::uint32x4_t) -> std::arch::aarch64::float32x4_t {
    use std::arch::aarch64::*;

    let mask_ff = vdupq_n_u32(0xFF);

    // Extract RGB channels via SIMD
    let r_a = vandq_u32(va, mask_ff);
    let g_a = vandq_u32(vshrq_n_u32(va, 8), mask_ff);
    let b_a = vandq_u32(vshrq_n_u32(va, 16), mask_ff);

    let r_b = vandq_u32(vb, mask_ff);
    let g_b = vandq_u32(vshrq_n_u32(vb, 8), mask_ff);
    let b_b = vandq_u32(vshrq_n_u32(vb, 16), mask_ff);

    // Convert to f32 and compute differences
    let dr = vsubq_f32(vcvtq_f32_u32(r_a), vcvtq_f32_u32(r_b));
    let dg = vsubq_f32(vcvtq_f32_u32(g_a), vcvtq_f32_u32(g_b));
    let db = vsubq_f32(vcvtq_f32_u32(b_a), vcvtq_f32_u32(b_b));

    // YIQ calculation using FMA
    let vy = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Y_F32[0]), dg, YIQ_Y_F32[1]), db, YIQ_Y_F32[2]);
    let vi = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(dr, YIQ_I_F32[0]), dg, YIQ_I_F32[1]), db, YIQ_I_F32[2]);
    let vq = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(dr, YIQ_Q_F32[0]), dg, YIQ_Q_F32[1]), db, YIQ_Q_F32[2]);

    // Weighted sum
    let vy2 = vmulq_f32(vy, vy);
    let vi2 = vmulq_f32(vi, vi);
    let vq2 = vmulq_f32(vq, vq);

    vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(vy2, YIQ_WEIGHTS_F32[0]), vi2, YIQ_WEIGHTS_F32[1]), vq2, YIQ_WEIGHTS_F32[2])
}

/// SSE4.1: Extract RGB and compute YIQ delta for 4 pixels - pure SIMD
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn yiq_delta_4_sse_direct(va: std::arch::x86_64::__m128i, vb: std::arch::x86_64::__m128i) -> std::arch::x86_64::__m128 {
    use std::arch::x86_64::*;

    let mask_ff = _mm_set1_epi32(0xFF);

    // Extract RGB channels via SIMD
    let r_a = _mm_and_si128(va, mask_ff);
    let g_a = _mm_and_si128(_mm_srli_epi32(va, 8), mask_ff);
    let b_a = _mm_and_si128(_mm_srli_epi32(va, 16), mask_ff);

    let r_b = _mm_and_si128(vb, mask_ff);
    let g_b = _mm_and_si128(_mm_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm_and_si128(_mm_srli_epi32(vb, 16), mask_ff);

    // Convert to f32 and compute differences
    let dr = _mm_sub_ps(_mm_cvtepi32_ps(r_a), _mm_cvtepi32_ps(r_b));
    let dg = _mm_sub_ps(_mm_cvtepi32_ps(g_a), _mm_cvtepi32_ps(g_b));
    let db = _mm_sub_ps(_mm_cvtepi32_ps(b_a), _mm_cvtepi32_ps(b_b));

    // YIQ coefficients
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

    // YIQ calculation
    let vy = _mm_add_ps(_mm_add_ps(_mm_mul_ps(dr, y_r), _mm_mul_ps(dg, y_g)), _mm_mul_ps(db, y_b));
    let vi = _mm_add_ps(_mm_add_ps(_mm_mul_ps(dr, i_r), _mm_mul_ps(dg, i_g)), _mm_mul_ps(db, i_b));
    let vq = _mm_add_ps(_mm_add_ps(_mm_mul_ps(dr, q_r), _mm_mul_ps(dg, q_g)), _mm_mul_ps(db, q_b));

    // Weighted sum
    let vy2 = _mm_mul_ps(vy, vy);
    let vi2 = _mm_mul_ps(vi, vi);
    let vq2 = _mm_mul_ps(vq, vq);

    _mm_add_ps(_mm_add_ps(_mm_mul_ps(vy2, w_y), _mm_mul_ps(vi2, w_i)), _mm_mul_ps(vq2, w_q))
}

/// AVX2+FMA: Extract RGB and compute YIQ delta for 8 pixels - pure SIMD
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn yiq_delta_8_avx2_direct(va: std::arch::x86_64::__m256i, vb: std::arch::x86_64::__m256i) -> std::arch::x86_64::__m256 {
    use std::arch::x86_64::*;

    let mask_ff = _mm256_set1_epi32(0xFF);

    // Extract RGB channels via SIMD
    let r_a = _mm256_and_si256(va, mask_ff);
    let g_a = _mm256_and_si256(_mm256_srli_epi32(va, 8), mask_ff);
    let b_a = _mm256_and_si256(_mm256_srli_epi32(va, 16), mask_ff);

    let r_b = _mm256_and_si256(vb, mask_ff);
    let g_b = _mm256_and_si256(_mm256_srli_epi32(vb, 8), mask_ff);
    let b_b = _mm256_and_si256(_mm256_srli_epi32(vb, 16), mask_ff);

    // Convert to f32 and compute differences
    let dr = _mm256_sub_ps(_mm256_cvtepi32_ps(r_a), _mm256_cvtepi32_ps(r_b));
    let dg = _mm256_sub_ps(_mm256_cvtepi32_ps(g_a), _mm256_cvtepi32_ps(g_b));
    let db = _mm256_sub_ps(_mm256_cvtepi32_ps(b_a), _mm256_cvtepi32_ps(b_b));

    // YIQ coefficients
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

    // YIQ calculation using FMA
    let vy = _mm256_fmadd_ps(dr, y_r, _mm256_fmadd_ps(dg, y_g, _mm256_mul_ps(db, y_b)));
    let vi = _mm256_fmadd_ps(dr, i_r, _mm256_fmadd_ps(dg, i_g, _mm256_mul_ps(db, i_b)));
    let vq = _mm256_fmadd_ps(dr, q_r, _mm256_fmadd_ps(dg, q_g, _mm256_mul_ps(db, q_b)));

    // Weighted sum using FMA
    let vy2 = _mm256_mul_ps(vy, vy);
    let vi2 = _mm256_mul_ps(vi, vi);
    let vq2 = _mm256_mul_ps(vq, vq);

    _mm256_fmadd_ps(vy2, w_y, _mm256_fmadd_ps(vi2, w_i, _mm256_mul_ps(vq2, w_q)))
}

// =============================================================================
// Hot row processing
// =============================================================================

#[inline]
fn process_hot_row(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    #[cfg(target_arch = "aarch64")]
    {
        process_hot_row_neon(
            image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
        )
    }

    #[cfg(target_arch = "x86_64")]
    {
        process_hot_row_x86(
            image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
        )
    }

    #[cfg(target_arch = "riscv64")]
    {
        process_hot_row_scalar(
            image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
        )
    }

    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64", target_arch = "riscv64")))]
    {
        process_hot_row_scalar(
            image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
        )
    }
}

#[cfg(target_arch = "aarch64")]
#[inline]
fn process_hot_row_neon(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    use std::arch::aarch64::*;

    let width = image1.width;
    let row_offset = (y * width) as usize;
    let row_width = (end_x - start_x) as usize;
    let mut diff_count = 0u32;
    let mut offset = 0usize;

    unsafe {
        let base_offset = row_offset + start_x as usize;
        let a_ptr = a32.as_ptr().add(base_offset);
        let b_ptr = b32.as_ptr().add(base_offset);

        while offset + 4 <= row_width {
            let va = vld1q_u32(a_ptr.add(offset));
            let vb = vld1q_u32(b_ptr.add(offset));
            let not_cmp = vmvnq_u32(vceqq_u32(va, vb));

            if vmaxvq_u32(not_cmp) == 0 {
                // All 4 pixels identical
                if draw_background {
                    if let Some(ref mut out) = output {
                        for i in 0..4 {
                            draw_gray_pixel_u32(image1, base_offset + offset + i, options.alpha, out);
                        }
                    }
                }
            } else {
                // Check if all pixels are opaque
                let alpha_mask = vdupq_n_u32(0xFF000000);
                let a_alpha = vandq_u32(va, alpha_mask);
                let b_alpha = vandq_u32(vb, alpha_mask);
                let all_opaque = vminvq_u32(a_alpha) == 0xFF000000 && vminvq_u32(b_alpha) == 0xFF000000;

                if all_opaque {
                    // Fast path: pure SIMD YIQ
                    let deltas = yiq_delta_4_neon_direct(va, vb);
                    let mut delta_arr = [0f32; 4];
                    vst1q_f32(delta_arr.as_mut_ptr(), deltas);

                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        let pa = *a_ptr.add(offset + i);
                        let pb = *b_ptr.add(offset + i);
                        diff_count += process_pixel_f32(
                            image1, image2, pa, pb, pixel_index,
                            start_x + offset as u32 + i as u32, y, delta_arr[i], max_delta,
                            options, output.as_deref_mut(), draw_background,
                        );
                    }
                } else {
                    // Slow path: per-pixel with alpha handling
                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        let pa = *a_ptr.add(offset + i);
                        let pb = *b_ptr.add(offset + i);
                        let delta = color_delta_f32(pa, pb);
                        diff_count += process_pixel_f32(
                            image1, image2, pa, pb, pixel_index,
                            start_x + offset as u32 + i as u32, y, delta, max_delta,
                            options, output.as_deref_mut(), draw_background,
                        );
                    }
                }
            }
            offset += 4;
        }
    }

    // Scalar remainder
    for i in offset..row_width {
        let pixel_index = row_offset + start_x as usize + i;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];
        let delta = color_delta_f32(pixel_a, pixel_b);
        diff_count += process_pixel_f32(
            image1, image2, pixel_a, pixel_b, pixel_index,
            start_x + i as u32, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
}

#[cfg(target_arch = "x86_64")]
#[inline]
fn process_hot_row_x86(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    // Check once at function entry
    if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
        unsafe {
            process_hot_row_avx2(
                image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
            )
        }
    } else if is_x86_feature_detected!("sse4.1") {
        unsafe {
            process_hot_row_sse(
                image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
            )
        }
    } else {
        process_hot_row_scalar(
            image1, image2, a32, b32, y, start_x, end_x, max_delta, options, output, draw_background,
        )
    }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn process_hot_row_avx2(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    use std::arch::x86_64::*;

    let width = image1.width;
    let row_offset = (y * width) as usize;
    let row_width = (end_x - start_x) as usize;
    let mut diff_count = 0u32;
    let mut offset = 0usize;

    let base_offset = row_offset + start_x as usize;
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
                if let Some(ref mut out) = output {
                    for i in 0..8 {
                        draw_gray_pixel_u32(image1, base_offset + offset + i, options.alpha, out);
                    }
                }
            }
        } else {
            // Check if all pixels are opaque
            let alpha_mask = _mm256_set1_epi32(0xFF000000u32 as i32);
            let a_alpha = _mm256_and_si256(va, alpha_mask);
            let b_alpha = _mm256_and_si256(vb, alpha_mask);
            let a_cmp = _mm256_cmpeq_epi32(a_alpha, alpha_mask);
            let b_cmp = _mm256_cmpeq_epi32(b_alpha, alpha_mask);
            let all_opaque = _mm256_movemask_ps(_mm256_castsi256_ps(a_cmp)) == 0xFF
                          && _mm256_movemask_ps(_mm256_castsi256_ps(b_cmp)) == 0xFF;

            if all_opaque {
                // Fast path: pure SIMD YIQ for 8 pixels
                let deltas = yiq_delta_8_avx2_direct(va, vb);
                let mut delta_arr = [0f32; 8];
                _mm256_storeu_ps(delta_arr.as_mut_ptr(), deltas);

                for i in 0..8 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta_arr[i], max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            } else {
                // Slow path
                for i in 0..8 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    let delta = color_delta_f32(pa, pb);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta, max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            }
        }
        offset += 8;
    }

    // SSE4.1 for remaining 4-pixel chunks
    while offset + 4 <= row_width {
        let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
        let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
        let cmp = _mm_cmpeq_epi32(va, vb);
        let mask = _mm_movemask_epi8(cmp);

        if mask == 0xFFFF {
            if draw_background {
                if let Some(ref mut out) = output {
                    for i in 0..4 {
                        draw_gray_pixel_u32(image1, base_offset + offset + i, options.alpha, out);
                    }
                }
            }
        } else {
            let alpha_mask = _mm_set1_epi32(0xFF000000u32 as i32);
            let a_alpha = _mm_and_si128(va, alpha_mask);
            let b_alpha = _mm_and_si128(vb, alpha_mask);
            let a_cmp = _mm_cmpeq_epi32(a_alpha, alpha_mask);
            let b_cmp = _mm_cmpeq_epi32(b_alpha, alpha_mask);
            let all_opaque = _mm_movemask_epi8(a_cmp) == 0xFFFF && _mm_movemask_epi8(b_cmp) == 0xFFFF;

            if all_opaque {
                let deltas = yiq_delta_4_sse_direct(va, vb);
                let mut delta_arr = [0f32; 4];
                _mm_storeu_ps(delta_arr.as_mut_ptr(), deltas);

                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta_arr[i], max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            } else {
                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    let delta = color_delta_f32(pa, pb);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta, max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            }
        }
        offset += 4;
    }

    // Scalar remainder
    for i in offset..row_width {
        let pixel_index = row_offset + start_x as usize + i;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];
        let delta = color_delta_f32(pixel_a, pixel_b);
        diff_count += process_pixel_f32(
            image1, image2, pixel_a, pixel_b, pixel_index,
            start_x + i as u32, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn process_hot_row_sse(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    use std::arch::x86_64::*;

    let width = image1.width;
    let row_offset = (y * width) as usize;
    let row_width = (end_x - start_x) as usize;
    let mut diff_count = 0u32;
    let mut offset = 0usize;

    let base_offset = row_offset + start_x as usize;
    let a_ptr = a32.as_ptr().add(base_offset);
    let b_ptr = b32.as_ptr().add(base_offset);

    while offset + 4 <= row_width {
        let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
        let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
        let cmp = _mm_cmpeq_epi32(va, vb);
        let mask = _mm_movemask_epi8(cmp);

        if mask == 0xFFFF {
            if draw_background {
                if let Some(ref mut out) = output {
                    for i in 0..4 {
                        draw_gray_pixel_u32(image1, base_offset + offset + i, options.alpha, out);
                    }
                }
            }
        } else {
            let alpha_mask = _mm_set1_epi32(0xFF000000u32 as i32);
            let a_alpha = _mm_and_si128(va, alpha_mask);
            let b_alpha = _mm_and_si128(vb, alpha_mask);
            let a_cmp = _mm_cmpeq_epi32(a_alpha, alpha_mask);
            let b_cmp = _mm_cmpeq_epi32(b_alpha, alpha_mask);
            let all_opaque = _mm_movemask_epi8(a_cmp) == 0xFFFF && _mm_movemask_epi8(b_cmp) == 0xFFFF;

            if all_opaque {
                let deltas = yiq_delta_4_sse_direct(va, vb);
                let mut delta_arr = [0f32; 4];
                _mm_storeu_ps(delta_arr.as_mut_ptr(), deltas);

                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta_arr[i], max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            } else {
                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    let pa = *a_ptr.add(offset + i);
                    let pb = *b_ptr.add(offset + i);
                    let delta = color_delta_f32(pa, pb);
                    diff_count += process_pixel_f32(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta, max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            }
        }
        offset += 4;
    }

    for i in offset..row_width {
        let pixel_index = row_offset + start_x as usize + i;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];
        let delta = color_delta_f32(pixel_a, pixel_b);
        diff_count += process_pixel_f32(
            image1, image2, pixel_a, pixel_b, pixel_index,
            start_x + i as u32, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
}

#[cfg(not(target_arch = "aarch64"))]
#[inline]
fn process_hot_row_scalar(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f32,
    options: &DiffOptions,
    output: &mut Option<&mut Image>,
    draw_background: bool,
) -> u32 {
    let width = image1.width;
    let row_offset = (y * width) as usize;
    let mut diff_count = 0u32;

    for x in start_x..end_x {
        let pixel_index = row_offset + x as usize;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];
        let delta = color_delta_f32(pixel_a, pixel_b);

        diff_count += process_pixel_f32(
            image1, image2, pixel_a, pixel_b, pixel_index, x, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
}

// =============================================================================
// Main diff function
// =============================================================================

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

    let block_size = calculate_block_size(width, height);
    let blocks_x = (width + block_size - 1) / block_size;
    let blocks_y = (height + block_size - 1) / block_size;

    let a32 = image1.as_u32();
    let b32 = image2.as_u32();
    let max_delta = threshold_to_max_delta_f32(options.threshold);

    // Cold pass: identify changed blocks without filling gray (deferred)
    let mut changed_blocks: Vec<u16> = Vec::with_capacity((blocks_x * blocks_y) as usize / 4);

    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let start_x = bx * block_size;
            let start_y = by * block_size;
            let end_x = (start_x + block_size).min(width);
            let end_y = (start_y + block_size).min(height);

            if block_has_perceptual_diff(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
            {
                changed_blocks.push((by * blocks_x + bx) as u16);
            }
        }
    }

    // Early exit for identical images (no gray fill work needed!)
    if changed_blocks.is_empty() {
        return Ok(DiffResult::new(0, total_pixels));
    }

    // Deferred gray fill: only fill unchanged blocks now that we know there are diffs
    let draw_background = output.is_some() && !options.diff_mask;
    if draw_background {
        if let Some(ref mut out) = output {
            let total_blocks = (blocks_x * blocks_y) as usize;

            // Use bitset for large block counts, sorted vec for small
            if total_blocks > 256 {
                // Bitset approach - O(1) lookup, O(n) memory where n = total_blocks / 8
                let mut changed_bits = vec![0u8; (total_blocks + 7) / 8];
                for &idx in &changed_blocks {
                    let i = idx as usize;
                    changed_bits[i / 8] |= 1 << (i % 8);
                }

                for by in 0..blocks_y {
                    for bx in 0..blocks_x {
                        let block_idx = (by * blocks_x + bx) as usize;
                        if changed_bits[block_idx / 8] & (1 << (block_idx % 8)) == 0 {
                            let start_x = bx * block_size;
                            let start_y = by * block_size;
                            let end_x = (start_x + block_size).min(width);
                            let end_y = (start_y + block_size).min(height);
                            fill_block_gray(image1, out, options.alpha, start_x, start_y, end_x, end_y);
                        }
                    }
                }
            } else {
                // Small block count - linear search is faster than hashing
                for by in 0..blocks_y {
                    for bx in 0..blocks_x {
                        let block_idx = (by * blocks_x + bx) as u16;
                        if !changed_blocks.contains(&block_idx) {
                            let start_x = bx * block_size;
                            let start_y = by * block_size;
                            let end_x = (start_x + block_size).min(width);
                            let end_y = (start_y + block_size).min(height);
                            fill_block_gray(image1, out, options.alpha, start_x, start_y, end_x, end_y);
                        }
                    }
                }
            }
        }
    }

    // Hot pass: process changed blocks
    let mut diff_count = 0u32;

    for &block_idx in &changed_blocks {
        let bx = (block_idx as u32) % blocks_x;
        let by = (block_idx as u32) / blocks_x;
        let start_x = bx * block_size;
        let start_y = by * block_size;
        let end_x = (start_x + block_size).min(width);
        let end_y = (start_y + block_size).min(height);

        for y in start_y..end_y {
            diff_count += process_hot_row(
                image1, image2, a32, b32, y, start_x, end_x, max_delta, options, &mut output,
                draw_background,
            );
        }
    }

    Ok(DiffResult::new(diff_count, total_pixels))
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
        let result = diff(&img1, &img2, None, &DiffOptions::default()).unwrap();
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
}
