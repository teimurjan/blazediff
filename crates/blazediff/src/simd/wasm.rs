//! Wasm32 v128 SIMD intrinsics.
//!
//! Mirrors the aarch64 NEON primitives in 4-lane form. Requires the
//! `simd128` target feature: build with `RUSTFLAGS="-C target-feature=+simd128"`.
//! Baseline simd128 has no native FMA, so weighted sums use add(a, mul(b, c)).

#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::*;

#[cfg(target_arch = "wasm32")]
#[inline]
#[target_feature(enable = "simd128")]
pub unsafe fn compare_4_wasm(a: *const u32, b: *const u32) -> bool {
    let va = v128_load(a as *const v128);
    let vb = v128_load(b as *const v128);

    // Equal lanes → 0xFFFFFFFF, different lanes → 0. Negate, then check any-true.
    let eq = i32x4_eq(va, vb);
    let diff = v128_not(eq);
    v128_any_true(diff)
}

#[cfg(target_arch = "wasm32")]
#[inline]
#[target_feature(enable = "simd128")]
pub unsafe fn yiq_delta_4_wasm(pixels_a: *const u32, pixels_b: *const u32, output: *mut f32) {
    let pa = v128_load(pixels_a as *const v128);
    let pb = v128_load(pixels_b as *const v128);

    let mask_ff = u32x4_splat(0xFF);

    let r_a = v128_and(pa, mask_ff);
    let g_a = v128_and(u32x4_shr(pa, 8), mask_ff);
    let b_a = v128_and(u32x4_shr(pa, 16), mask_ff);
    let a_a = u32x4_shr(pa, 24);

    let r_b = v128_and(pb, mask_ff);
    let g_b = v128_and(u32x4_shr(pb, 8), mask_ff);
    let b_b = v128_and(u32x4_shr(pb, 16), mask_ff);
    let a_b = u32x4_shr(pb, 24);

    let r_a_f = f32x4_convert_u32x4(r_a);
    let g_a_f = f32x4_convert_u32x4(g_a);
    let b_a_f = f32x4_convert_u32x4(b_a);
    let a_a_f = f32x4_convert_u32x4(a_a);

    let r_b_f = f32x4_convert_u32x4(r_b);
    let g_b_f = f32x4_convert_u32x4(g_b);
    let b_b_f = f32x4_convert_u32x4(b_b);
    let a_b_f = f32x4_convert_u32x4(a_b);

    let v255 = f32x4_splat(255.0);
    let inv255 = f32x4_splat(1.0 / 255.0);

    let alpha_norm_a = f32x4_mul(a_a_f, inv255);
    let alpha_norm_b = f32x4_mul(a_b_f, inv255);

    // Blend onto white background: 255 + (color - 255) * alpha
    let br_a = f32x4_add(v255, f32x4_mul(f32x4_sub(r_a_f, v255), alpha_norm_a));
    let bg_a = f32x4_add(v255, f32x4_mul(f32x4_sub(g_a_f, v255), alpha_norm_a));
    let bb_a = f32x4_add(v255, f32x4_mul(f32x4_sub(b_a_f, v255), alpha_norm_a));

    let br_b = f32x4_add(v255, f32x4_mul(f32x4_sub(r_b_f, v255), alpha_norm_b));
    let bg_b = f32x4_add(v255, f32x4_mul(f32x4_sub(g_b_f, v255), alpha_norm_b));
    let bb_b = f32x4_add(v255, f32x4_mul(f32x4_sub(b_b_f, v255), alpha_norm_b));

    let dr = f32x4_sub(br_a, br_b);
    let dg = f32x4_sub(bg_a, bg_b);
    let db = f32x4_sub(bb_a, bb_b);

    let y_r = f32x4_splat(0.29889531);
    let y_g = f32x4_splat(0.58662247);
    let y_b = f32x4_splat(0.11448223);

    let i_r = f32x4_splat(0.59597799);
    let i_g = f32x4_splat(-0.2741761);
    let i_b = f32x4_splat(-0.32180189);

    let q_r = f32x4_splat(0.21147017);
    let q_g = f32x4_splat(-0.52261711);
    let q_b = f32x4_splat(0.31114694);

    // Y/I/Q channel deltas (no FMA in baseline simd128).
    let y = f32x4_add(
        f32x4_add(f32x4_mul(dr, y_r), f32x4_mul(dg, y_g)),
        f32x4_mul(db, y_b),
    );
    let i = f32x4_add(
        f32x4_add(f32x4_mul(dr, i_r), f32x4_mul(dg, i_g)),
        f32x4_mul(db, i_b),
    );
    let q = f32x4_add(
        f32x4_add(f32x4_mul(dr, q_r), f32x4_mul(dg, q_g)),
        f32x4_mul(db, q_b),
    );

    let w_y = f32x4_splat(0.5053);
    let w_i = f32x4_splat(0.299);
    let w_q = f32x4_splat(0.1957);

    let y2 = f32x4_mul(y, y);
    let i2 = f32x4_mul(i, i);
    let q2 = f32x4_mul(q, q);

    let delta = f32x4_add(
        f32x4_add(f32x4_mul(y2, w_y), f32x4_mul(i2, w_i)),
        f32x4_mul(q2, w_q),
    );

    v128_store(output as *mut v128, delta);
}

#[cfg(test)]
#[cfg(target_arch = "wasm32")]
mod tests {
    use super::*;

    #[test]
    fn test_compare_4_wasm() {
        unsafe {
            let a = [1u32, 2, 3, 4];
            let b = [1u32, 2, 3, 4];
            assert!(!compare_4_wasm(a.as_ptr(), b.as_ptr()));

            let c = [1u32, 2, 3, 5];
            assert!(compare_4_wasm(a.as_ptr(), c.as_ptr()));
        }
    }

    #[test]
    fn test_yiq_delta_4_wasm() {
        unsafe {
            let white = [0xFFFFFFFFu32; 4];
            let black = [0xFF000000u32; 4];

            let mut output = [0.0f32; 4];
            yiq_delta_4_wasm(white.as_ptr(), black.as_ptr(), output.as_mut_ptr());
            for delta in output {
                assert!(delta > 30000.0);
            }

            yiq_delta_4_wasm(white.as_ptr(), white.as_ptr(), output.as_mut_ptr());
            for delta in output {
                assert!(delta < 1.0);
            }
        }
    }
}
