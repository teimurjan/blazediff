//! AArch64 NEON intrinsics

#[cfg(target_arch = "aarch64")]
use std::arch::aarch64::*;

#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn compare_4_neon(a: *const u32, b: *const u32) -> bool {
    let va = vld1q_u32(a);
    let vb = vld1q_u32(b);

    // Compare for equality (returns 0xFFFFFFFF for equal, 0 for different)
    let cmp = vceqq_u32(va, vb);

    // Invert to get mask where 1 = different
    let not_cmp = vmvnq_u32(cmp);

    // Check if any lane is non-zero (i.e., any difference)
    vmaxvq_u32(not_cmp) != 0
}

#[cfg(target_arch = "aarch64")]
#[inline]
pub unsafe fn yiq_delta_4_neon(pixels_a: *const u32, pixels_b: *const u32, output: *mut f32) {
    let pa = vld1q_u32(pixels_a);
    let pb = vld1q_u32(pixels_b);

    // Extract RGBA channels
    let mask_ff = vdupq_n_u32(0xFF);

    let r_a = vandq_u32(pa, mask_ff);
    let g_a = vandq_u32(vshrq_n_u32(pa, 8), mask_ff);
    let b_a = vandq_u32(vshrq_n_u32(pa, 16), mask_ff);
    let a_a = vshrq_n_u32(pa, 24);

    let r_b = vandq_u32(pb, mask_ff);
    let g_b = vandq_u32(vshrq_n_u32(pb, 8), mask_ff);
    let b_b = vandq_u32(vshrq_n_u32(pb, 16), mask_ff);
    let a_b = vshrq_n_u32(pb, 24);

    // Convert to float
    let r_a_f = vcvtq_f32_u32(r_a);
    let g_a_f = vcvtq_f32_u32(g_a);
    let b_a_f = vcvtq_f32_u32(b_a);
    let a_a_f = vcvtq_f32_u32(a_a);

    let r_b_f = vcvtq_f32_u32(r_b);
    let g_b_f = vcvtq_f32_u32(g_b);
    let b_b_f = vcvtq_f32_u32(b_b);
    let a_b_f = vcvtq_f32_u32(a_b);

    // Alpha blending with white background
    let v255 = vdupq_n_f32(255.0);
    let inv255 = vdupq_n_f32(1.0 / 255.0);

    let alpha_norm_a = vmulq_f32(a_a_f, inv255);
    let alpha_norm_b = vmulq_f32(a_b_f, inv255);

    // Blend: 255 + (color - 255) * alpha
    let br_a = vfmaq_f32(v255, vsubq_f32(r_a_f, v255), alpha_norm_a);
    let bg_a = vfmaq_f32(v255, vsubq_f32(g_a_f, v255), alpha_norm_a);
    let bb_a = vfmaq_f32(v255, vsubq_f32(b_a_f, v255), alpha_norm_a);

    let br_b = vfmaq_f32(v255, vsubq_f32(r_b_f, v255), alpha_norm_b);
    let bg_b = vfmaq_f32(v255, vsubq_f32(g_b_f, v255), alpha_norm_b);
    let bb_b = vfmaq_f32(v255, vsubq_f32(b_b_f, v255), alpha_norm_b);

    // RGB differences
    let dr = vsubq_f32(br_a, br_b);
    let dg = vsubq_f32(bg_a, bg_b);
    let db = vsubq_f32(bb_a, bb_b);

    // YIQ coefficients
    let y_r = vdupq_n_f32(0.29889531);
    let y_g = vdupq_n_f32(0.58662247);
    let y_b = vdupq_n_f32(0.11448223);

    let i_r = vdupq_n_f32(0.59597799);
    let i_g = vdupq_n_f32(-0.2741761);
    let i_b = vdupq_n_f32(-0.32180189);

    let q_r = vdupq_n_f32(0.21147017);
    let q_g = vdupq_n_f32(-0.52261711);
    let q_b = vdupq_n_f32(0.31114694);

    // Calculate Y, I, Q differences using FMA
    let y = vfmaq_f32(vfmaq_f32(vmulq_f32(db, y_b), dg, y_g), dr, y_r);
    let i = vfmaq_f32(vfmaq_f32(vmulq_f32(db, i_b), dg, i_g), dr, i_r);
    let q = vfmaq_f32(vfmaq_f32(vmulq_f32(db, q_b), dg, q_g), dr, q_r);

    // Weighted sum: 0.5053*Y^2 + 0.299*I^2 + 0.1957*Q^2
    let w_y = vdupq_n_f32(0.5053);
    let w_i = vdupq_n_f32(0.299);
    let w_q = vdupq_n_f32(0.1957);

    let y2 = vmulq_f32(y, y);
    let i2 = vmulq_f32(i, i);
    let q2 = vmulq_f32(q, q);

    let delta = vfmaq_f32(vfmaq_f32(vmulq_f32(q2, w_q), i2, w_i), y2, w_y);

    // Store results
    vst1q_f32(output, delta);
}

#[cfg(test)]
#[cfg(target_arch = "aarch64")]
mod tests {
    use super::*;

    #[test]
    fn test_compare_4_neon() {
        unsafe {
            let a = [1u32, 2, 3, 4];
            let b = [1u32, 2, 3, 4];
            assert!(!compare_4_neon(a.as_ptr(), b.as_ptr()));

            let c = [1u32, 2, 3, 5];
            assert!(compare_4_neon(a.as_ptr(), c.as_ptr()));
        }
    }

    #[test]
    fn test_yiq_delta_4_neon() {
        unsafe {
            // White pixels
            let white = [0xFFFFFFFFu32; 4];
            // Black pixels
            let black = [0xFF000000u32; 4];

            let mut output = [0.0f32; 4];
            yiq_delta_4_neon(white.as_ptr(), black.as_ptr(), output.as_mut_ptr());

            // Black vs white should have high delta
            for delta in output {
                assert!(delta > 30000.0, "Delta should be high for black vs white");
            }

            // Identical pixels should have zero delta
            yiq_delta_4_neon(white.as_ptr(), white.as_ptr(), output.as_mut_ptr());
            for delta in output {
                assert!(delta < 1.0, "Delta should be ~0 for identical pixels");
            }
        }
    }
}
