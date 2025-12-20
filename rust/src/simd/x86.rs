//! x86_64 SIMD intrinsics (SSE4.1, AVX2, AVX-512)

#[cfg(target_arch = "x86_64")]
use std::arch::x86_64::*;

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
pub unsafe fn compare_4_sse41(a: *const u32, b: *const u32) -> bool {
    let va = _mm_loadu_si128(a as *const __m128i);
    let vb = _mm_loadu_si128(b as *const __m128i);

    // Compare for equality
    let cmp = _mm_cmpeq_epi32(va, vb);

    // movemask returns 0xF if all equal, < 0xF if any differ
    let mask = _mm_movemask_ps(_mm_castsi128_ps(cmp));

    mask != 0xF
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
#[inline]
pub unsafe fn compare_8_avx2(a: *const u32, b: *const u32) -> bool {
    let va = _mm256_loadu_si256(a as *const __m256i);
    let vb = _mm256_loadu_si256(b as *const __m256i);

    // Compare for equality
    let cmp = _mm256_cmpeq_epi32(va, vb);

    // movemask returns 0xFF if all equal
    let mask = _mm256_movemask_ps(_mm256_castsi256_ps(cmp));

    mask != 0xFF
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx512f", enable = "avx512bw")]
#[inline]
pub unsafe fn compare_16_avx512(a: *const u32, b: *const u32) -> bool {
    let va = _mm512_loadu_si512(a as *const __m512i);
    let vb = _mm512_loadu_si512(b as *const __m512i);

    let mask = _mm512_cmpneq_epi32_mask(va, vb);
    mask != 0
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
pub unsafe fn yiq_delta_8_avx2(pixels_a: *const u32, pixels_b: *const u32, output: *mut f32) {
    // Load 8 pixels from each image
    let pa = _mm256_loadu_si256(pixels_a as *const __m256i);
    let pb = _mm256_loadu_si256(pixels_b as *const __m256i);

    // Extract RGBA channels
    let mask_ff = _mm256_set1_epi32(0xFF);

    let r_a = _mm256_and_si256(pa, mask_ff);
    let g_a = _mm256_and_si256(_mm256_srli_epi32(pa, 8), mask_ff);
    let b_a = _mm256_and_si256(_mm256_srli_epi32(pa, 16), mask_ff);
    let a_a = _mm256_srli_epi32(pa, 24);

    let r_b = _mm256_and_si256(pb, mask_ff);
    let g_b = _mm256_and_si256(_mm256_srli_epi32(pb, 8), mask_ff);
    let b_b = _mm256_and_si256(_mm256_srli_epi32(pb, 16), mask_ff);
    let a_b = _mm256_srli_epi32(pb, 24);

    // Convert to float
    let r_a_f = _mm256_cvtepi32_ps(r_a);
    let g_a_f = _mm256_cvtepi32_ps(g_a);
    let b_a_f = _mm256_cvtepi32_ps(b_a);
    let a_a_f = _mm256_cvtepi32_ps(a_a);

    let r_b_f = _mm256_cvtepi32_ps(r_b);
    let g_b_f = _mm256_cvtepi32_ps(g_b);
    let b_b_f = _mm256_cvtepi32_ps(b_b);
    let a_b_f = _mm256_cvtepi32_ps(a_b);

    // Alpha blending with white background
    let v255 = _mm256_set1_ps(255.0);
    let inv255 = _mm256_set1_ps(1.0 / 255.0);

    let alpha_norm_a = _mm256_mul_ps(a_a_f, inv255);
    let alpha_norm_b = _mm256_mul_ps(a_b_f, inv255);

    // Blend: 255 + (color - 255) * alpha
    let br_a = _mm256_fmadd_ps(_mm256_sub_ps(r_a_f, v255), alpha_norm_a, v255);
    let bg_a = _mm256_fmadd_ps(_mm256_sub_ps(g_a_f, v255), alpha_norm_a, v255);
    let bb_a = _mm256_fmadd_ps(_mm256_sub_ps(b_a_f, v255), alpha_norm_a, v255);

    let br_b = _mm256_fmadd_ps(_mm256_sub_ps(r_b_f, v255), alpha_norm_b, v255);
    let bg_b = _mm256_fmadd_ps(_mm256_sub_ps(g_b_f, v255), alpha_norm_b, v255);
    let bb_b = _mm256_fmadd_ps(_mm256_sub_ps(b_b_f, v255), alpha_norm_b, v255);

    // RGB differences
    let dr = _mm256_sub_ps(br_a, br_b);
    let dg = _mm256_sub_ps(bg_a, bg_b);
    let db = _mm256_sub_ps(bb_a, bb_b);

    // YIQ coefficients
    let y_r = _mm256_set1_ps(0.29889531);
    let y_g = _mm256_set1_ps(0.58662247);
    let y_b = _mm256_set1_ps(0.11448223);

    let i_r = _mm256_set1_ps(0.59597799);
    let i_g = _mm256_set1_ps(-0.2741761);
    let i_b = _mm256_set1_ps(-0.32180189);

    let q_r = _mm256_set1_ps(0.21147017);
    let q_g = _mm256_set1_ps(-0.52261711);
    let q_b = _mm256_set1_ps(0.31114694);

    // Calculate Y, I, Q differences using FMA
    let y = _mm256_fmadd_ps(dr, y_r, _mm256_fmadd_ps(dg, y_g, _mm256_mul_ps(db, y_b)));
    let i = _mm256_fmadd_ps(dr, i_r, _mm256_fmadd_ps(dg, i_g, _mm256_mul_ps(db, i_b)));
    let q = _mm256_fmadd_ps(dr, q_r, _mm256_fmadd_ps(dg, q_g, _mm256_mul_ps(db, q_b)));

    // Weighted sum: 0.5053*Y^2 + 0.299*I^2 + 0.1957*Q^2
    let w_y = _mm256_set1_ps(0.5053);
    let w_i = _mm256_set1_ps(0.299);
    let w_q = _mm256_set1_ps(0.1957);

    let y2 = _mm256_mul_ps(y, y);
    let i2 = _mm256_mul_ps(i, i);
    let q2 = _mm256_mul_ps(q, q);

    let delta = _mm256_fmadd_ps(y2, w_y, _mm256_fmadd_ps(i2, w_i, _mm256_mul_ps(q2, w_q)));

    // Store results
    _mm256_storeu_ps(output, delta);
}

#[cfg(test)]
#[cfg(target_arch = "x86_64")]
mod tests {
    use super::*;

    #[test]
    fn test_compare_4_sse41() {
        if !is_x86_feature_detected!("sse4.1") {
            return;
        }

        unsafe {
            let a = [1u32, 2, 3, 4];
            let b = [1u32, 2, 3, 4];
            assert!(!compare_4_sse41(a.as_ptr(), b.as_ptr()));

            let c = [1u32, 2, 3, 5];
            assert!(compare_4_sse41(a.as_ptr(), c.as_ptr()));
        }
    }

    #[test]
    fn test_compare_8_avx2() {
        if !is_x86_feature_detected!("avx2") {
            return;
        }

        unsafe {
            let a = [1u32, 2, 3, 4, 5, 6, 7, 8];
            let b = [1u32, 2, 3, 4, 5, 6, 7, 8];
            assert!(!compare_8_avx2(a.as_ptr(), b.as_ptr()));

            let c = [1u32, 2, 3, 4, 5, 6, 7, 9];
            assert!(compare_8_avx2(a.as_ptr(), c.as_ptr()));
        }
    }

    #[test]
    fn test_compare_16_avx512() {
        if !is_x86_feature_detected!("avx512f") || !is_x86_feature_detected!("avx512bw") {
            return;
        }

        unsafe {
            let a: [u32; 16] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
            let b: [u32; 16] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
            assert!(!compare_16_avx512(a.as_ptr(), b.as_ptr()));

            let mut c = a;
            c[15] = 99;
            assert!(compare_16_avx512(a.as_ptr(), c.as_ptr()));
        }
    }

    #[test]
    fn test_yiq_delta_8_avx2() {
        if !is_x86_feature_detected!("avx2") || !is_x86_feature_detected!("fma") {
            return;
        }

        unsafe {
            // White pixels (RGBA = 255,255,255,255 = 0xFFFFFFFF)
            let white = [0xFFFFFFFFu32; 8];
            // Black pixels (RGBA = 0,0,0,255 = 0xFF000000)
            let black = [0xFF000000u32; 8];

            let mut output = [0.0f32; 8];
            yiq_delta_8_avx2(white.as_ptr(), black.as_ptr(), output.as_mut_ptr());

            // Black vs white should have high delta
            for delta in output {
                assert!(delta > 30000.0, "Delta should be high for black vs white");
            }

            // Identical pixels should have zero delta
            yiq_delta_8_avx2(white.as_ptr(), white.as_ptr(), output.as_mut_ptr());
            for delta in output {
                assert!(
                    delta < 1.0,
                    "Delta should be ~0 for identical pixels, got {}",
                    delta
                );
            }
        }
    }
}
