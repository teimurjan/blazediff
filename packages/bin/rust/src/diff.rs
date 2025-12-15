//! Two-pass block-based image diff with SIMD acceleration.
//!
//! Cold pass: SIMD byte comparison to identify changed blocks, draw unchanged immediately.
//! Hot pass: YIQ perceptual delta with anti-aliasing detection on changed blocks only.
//!
//! SIMD: NEON (aarch64), SSE4.1 (x86_64), scalar fallback (riscv64, others).

use crate::antialiasing::is_antialiased;
use crate::output::{clear_transparent, draw_gray_pixel_u32, draw_pixel_u32, fill_block_gray};
use crate::types::{DiffError, DiffOptions, DiffResult, Image};
use crate::yiq::{color_delta, color_delta_opaque, is_opaque, threshold_to_max_delta, YIQ_I, YIQ_Q, YIQ_WEIGHTS, YIQ_Y};

#[inline]
fn calculate_block_size(width: u32, height: u32) -> u32 {
    let area = (width as f64) * (height as f64);
    let scale = area.sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();
    let log2_val = raw_size.log2();
    (1u32 << (log2_val.round() as u32)).clamp(8, 128)
}

#[inline]
fn process_pixel(
    image1: &Image,
    image2: &Image,
    pixel_a: u32,
    pixel_b: u32,
    pixel_index: usize,
    x: u32,
    y: u32,
    delta: f64,
    max_delta: f64,
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

#[inline]
fn block_has_perceptual_diff(
    a32: &[u32],
    b32: &[u32],
    width: u32,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    max_delta: f64,
) -> bool {
    #[cfg(target_arch = "aarch64")]
    {
        block_has_perceptual_diff_neon(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
    }

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("sse4.1") {
            unsafe {
                block_has_perceptual_diff_sse(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
            }
        } else {
            block_has_perceptual_diff_scalar(a32, b32, width, start_x, start_y, end_x, end_y, max_delta)
        }
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
    max_delta: f64,
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
                    for i in 0..4 {
                        let idx = row_start + offset + i;
                        let pa = a32[idx];
                        let pb = b32[idx];
                        if pa != pb && color_delta(pa, pb, idx, false).abs() > max_delta {
                            return true;
                        }
                    }
                }
                offset += 4;
            }
        }

        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta(pa, pb, idx, false).abs() > max_delta {
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
    max_delta: f64,
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
                for i in 0..4 {
                    let idx = row_start + offset + i;
                    let pa = a32[idx];
                    let pb = b32[idx];
                    if pa != pb && color_delta(pa, pb, idx, false).abs() > max_delta {
                        return true;
                    }
                }
            }
            offset += 4;
        }

        for i in offset..row_width {
            let idx = row_start + i;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta(pa, pb, idx, false).abs() > max_delta {
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
    max_delta: f64,
) -> bool {
    for y in start_y..end_y {
        for x in start_x..end_x {
            let idx = (y * width + x) as usize;
            let pa = a32[idx];
            let pb = b32[idx];
            if pa != pb && color_delta(pa, pb, idx, false).abs() > max_delta {
                return true;
            }
        }
    }
    false
}

#[cfg(target_arch = "aarch64")]
#[inline]
unsafe fn yiq_delta_4_neon(pixels_a: [u32; 4], pixels_b: [u32; 4]) -> [f32; 4] {
    use std::arch::aarch64::*;

    let mut dr = [0f32; 4];
    let mut dg = [0f32; 4];
    let mut db = [0f32; 4];

    for i in 0..4 {
        dr[i] = (pixels_a[i] & 0xFF) as f32 - (pixels_b[i] & 0xFF) as f32;
        dg[i] = ((pixels_a[i] >> 8) & 0xFF) as f32 - ((pixels_b[i] >> 8) & 0xFF) as f32;
        db[i] = ((pixels_a[i] >> 16) & 0xFF) as f32 - ((pixels_b[i] >> 16) & 0xFF) as f32;
    }

    let vdr = vld1q_f32(dr.as_ptr());
    let vdg = vld1q_f32(dg.as_ptr());
    let vdb = vld1q_f32(db.as_ptr());

    let y_r = YIQ_Y[0] as f32;
    let y_g = YIQ_Y[1] as f32;
    let y_b = YIQ_Y[2] as f32;
    let i_r = YIQ_I[0] as f32;
    let i_g = YIQ_I[1] as f32;
    let i_b = YIQ_I[2] as f32;
    let q_r = YIQ_Q[0] as f32;
    let q_g = YIQ_Q[1] as f32;
    let q_b = YIQ_Q[2] as f32;
    let w_y = YIQ_WEIGHTS[0] as f32;
    let w_i = YIQ_WEIGHTS[1] as f32;
    let w_q = YIQ_WEIGHTS[2] as f32;

    let vy = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(vdr, y_r), vdg, y_g), vdb, y_b);
    let vi = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(vdr, i_r), vdg, i_g), vdb, i_b);
    let vq = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(vdr, q_r), vdg, q_g), vdb, q_b);

    let vy2 = vmulq_f32(vy, vy);
    let vi2 = vmulq_f32(vi, vi);
    let vq2 = vmulq_f32(vq, vq);
    let vdelta = vfmaq_n_f32(vfmaq_n_f32(vmulq_n_f32(vy2, w_y), vi2, w_i), vq2, w_q);

    let mut result = [0f32; 4];
    vst1q_f32(result.as_mut_ptr(), vdelta);
    result
}

#[inline]
fn process_hot_row(
    image1: &Image,
    image2: &Image,
    a32: &[u32],
    b32: &[u32],
    y: u32,
    start_x: u32,
    end_x: u32,
    max_delta: f64,
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
        if is_x86_feature_detected!("sse4.1") {
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
    max_delta: f64,
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
    let max_delta_f32 = max_delta as f32;

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
                // At least one pixel differs - use vectorized YIQ for opaque, scalar for transparent
                let pixels_a = [
                    *a_ptr.add(offset),
                    *a_ptr.add(offset + 1),
                    *a_ptr.add(offset + 2),
                    *a_ptr.add(offset + 3),
                ];
                let pixels_b = [
                    *b_ptr.add(offset),
                    *b_ptr.add(offset + 1),
                    *b_ptr.add(offset + 2),
                    *b_ptr.add(offset + 3),
                ];

                // Check if all 8 pixels are opaque via SIMD
                let alpha_mask = vdupq_n_u32(0xFF000000);
                let a_alpha = vandq_u32(va, alpha_mask);
                let b_alpha = vandq_u32(vb, alpha_mask);
                let all_a_opaque = vminvq_u32(a_alpha) == 0xFF000000;
                let all_b_opaque = vminvq_u32(b_alpha) == 0xFF000000;

                if all_a_opaque && all_b_opaque {
                    // Fast path: all opaque, use SIMD YIQ
                    let deltas = yiq_delta_4_neon(pixels_a, pixels_b);
                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        diff_count += process_pixel_simd(
                            image1, image2, pixels_a[i], pixels_b[i], pixel_index,
                            start_x + offset as u32 + i as u32, y, deltas[i], max_delta_f32,
                            options, output.as_deref_mut(), draw_background,
                        );
                    }
                } else {
                    // Slow path: at least one transparent pixel
                    for i in 0..4 {
                        let pixel_index = base_offset + offset + i;
                        let pa = pixels_a[i];
                        let pb = pixels_b[i];

                        // Use fast opaque path per-pixel when possible
                        let delta = if is_opaque(pa) && is_opaque(pb) {
                            color_delta_opaque(pa, pb)
                        } else {
                            color_delta(pa, pb, pixel_index, false)
                        };

                        diff_count += process_pixel(
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

    // Handle remaining pixels
    for i in offset..row_width {
        let pixel_index = row_offset + start_x as usize + i;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];

        // Use fast opaque path when possible
        let delta = if is_opaque(pixel_a) && is_opaque(pixel_b) {
            color_delta_opaque(pixel_a, pixel_b)
        } else {
            color_delta(pixel_a, pixel_b, pixel_index, false)
        };

        diff_count += process_pixel(
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
unsafe fn yiq_delta_4_sse(pixels_a: [u32; 4], pixels_b: [u32; 4]) -> [f32; 4] {
    use std::arch::x86_64::*;

    let mut dr = [0f32; 4];
    let mut dg = [0f32; 4];
    let mut db = [0f32; 4];

    for i in 0..4 {
        dr[i] = (pixels_a[i] & 0xFF) as f32 - (pixels_b[i] & 0xFF) as f32;
        dg[i] = ((pixels_a[i] >> 8) & 0xFF) as f32 - ((pixels_b[i] >> 8) & 0xFF) as f32;
        db[i] = ((pixels_a[i] >> 16) & 0xFF) as f32 - ((pixels_b[i] >> 16) & 0xFF) as f32;
    }

    let vdr = _mm_loadu_ps(dr.as_ptr());
    let vdg = _mm_loadu_ps(dg.as_ptr());
    let vdb = _mm_loadu_ps(db.as_ptr());

    let y_r = _mm_set1_ps(YIQ_Y[0] as f32);
    let y_g = _mm_set1_ps(YIQ_Y[1] as f32);
    let y_b = _mm_set1_ps(YIQ_Y[2] as f32);
    let i_r = _mm_set1_ps(YIQ_I[0] as f32);
    let i_g = _mm_set1_ps(YIQ_I[1] as f32);
    let i_b = _mm_set1_ps(YIQ_I[2] as f32);
    let q_r = _mm_set1_ps(YIQ_Q[0] as f32);
    let q_g = _mm_set1_ps(YIQ_Q[1] as f32);
    let q_b = _mm_set1_ps(YIQ_Q[2] as f32);
    let w_y = _mm_set1_ps(YIQ_WEIGHTS[0] as f32);
    let w_i = _mm_set1_ps(YIQ_WEIGHTS[1] as f32);
    let w_q = _mm_set1_ps(YIQ_WEIGHTS[2] as f32);

    // Y = dr*y_r + dg*y_g + db*y_b
    let vy = _mm_add_ps(_mm_add_ps(_mm_mul_ps(vdr, y_r), _mm_mul_ps(vdg, y_g)), _mm_mul_ps(vdb, y_b));
    // I = dr*i_r + dg*i_g + db*i_b
    let vi = _mm_add_ps(_mm_add_ps(_mm_mul_ps(vdr, i_r), _mm_mul_ps(vdg, i_g)), _mm_mul_ps(vdb, i_b));
    // Q = dr*q_r + dg*q_g + db*q_b
    let vq = _mm_add_ps(_mm_add_ps(_mm_mul_ps(vdr, q_r), _mm_mul_ps(vdg, q_g)), _mm_mul_ps(vdb, q_b));

    // delta = w_y*y^2 + w_i*i^2 + w_q*q^2
    let vy2 = _mm_mul_ps(vy, vy);
    let vi2 = _mm_mul_ps(vi, vi);
    let vq2 = _mm_mul_ps(vq, vq);
    let vdelta = _mm_add_ps(_mm_add_ps(_mm_mul_ps(vy2, w_y), _mm_mul_ps(vi2, w_i)), _mm_mul_ps(vq2, w_q));

    let mut result = [0f32; 4];
    _mm_storeu_ps(result.as_mut_ptr(), vdelta);
    result
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
    max_delta: f64,
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
    let max_delta_f32 = max_delta as f32;

    let base_offset = row_offset + start_x as usize;
    let a_ptr = a32.as_ptr().add(base_offset);
    let b_ptr = b32.as_ptr().add(base_offset);

    while offset + 4 <= row_width {
        let va = _mm_loadu_si128(a_ptr.add(offset) as *const __m128i);
        let vb = _mm_loadu_si128(b_ptr.add(offset) as *const __m128i);
        let cmp = _mm_cmpeq_epi32(va, vb);
        let mask = _mm_movemask_epi8(cmp);

        if mask == 0xFFFF {
            // All 4 pixels identical
            if draw_background {
                if let Some(ref mut out) = output {
                    for i in 0..4 {
                        draw_gray_pixel_u32(image1, base_offset + offset + i, options.alpha, out);
                    }
                }
            }
        } else {
            let pixels_a = [
                *a_ptr.add(offset),
                *a_ptr.add(offset + 1),
                *a_ptr.add(offset + 2),
                *a_ptr.add(offset + 3),
            ];
            let pixels_b = [
                *b_ptr.add(offset),
                *b_ptr.add(offset + 1),
                *b_ptr.add(offset + 2),
                *b_ptr.add(offset + 3),
            ];

            // Check if all 8 pixels are opaque via SIMD
            let alpha_mask = _mm_set1_epi32(0xFF000000u32 as i32);
            let a_alpha = _mm_and_si128(va, alpha_mask);
            let b_alpha = _mm_and_si128(vb, alpha_mask);
            let a_cmp = _mm_cmpeq_epi32(a_alpha, alpha_mask);
            let b_cmp = _mm_cmpeq_epi32(b_alpha, alpha_mask);
            let all_opaque = _mm_movemask_epi8(a_cmp) == 0xFFFF && _mm_movemask_epi8(b_cmp) == 0xFFFF;

            if all_opaque {
                // Fast path: all opaque, use SIMD YIQ
                let deltas = yiq_delta_4_sse(pixels_a, pixels_b);
                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    diff_count += process_pixel_simd(
                        image1, image2, pixels_a[i], pixels_b[i], pixel_index,
                        start_x + offset as u32 + i as u32, y, deltas[i], max_delta_f32,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            } else {
                // Slow path: at least one transparent pixel
                for i in 0..4 {
                    let pixel_index = base_offset + offset + i;
                    let pa = pixels_a[i];
                    let pb = pixels_b[i];

                    // Use fast opaque path per-pixel when possible
                    let delta = if is_opaque(pa) && is_opaque(pb) {
                        color_delta_opaque(pa, pb)
                    } else {
                        color_delta(pa, pb, pixel_index, false)
                    };

                    diff_count += process_pixel(
                        image1, image2, pa, pb, pixel_index,
                        start_x + offset as u32 + i as u32, y, delta, max_delta,
                        options, output.as_deref_mut(), draw_background,
                    );
                }
            }
        }
        offset += 4;
    }

    // Handle remaining pixels
    for i in offset..row_width {
        let pixel_index = row_offset + start_x as usize + i;
        let pixel_a = a32[pixel_index];
        let pixel_b = b32[pixel_index];

        // Use fast opaque path when possible
        let delta = if is_opaque(pixel_a) && is_opaque(pixel_b) {
            color_delta_opaque(pixel_a, pixel_b)
        } else {
            color_delta(pixel_a, pixel_b, pixel_index, false)
        };

        diff_count += process_pixel(
            image1, image2, pixel_a, pixel_b, pixel_index,
            start_x + i as u32, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
}

#[inline]
fn process_pixel_simd(
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

    if delta > max_delta {
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
                draw_pixel_u32(out, pixel_index, &options.diff_color);
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
    max_delta: f64,
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

        // Use fast opaque path when possible
        let delta = if is_opaque(pixel_a) && is_opaque(pixel_b) {
            color_delta_opaque(pixel_a, pixel_b)
        } else {
            color_delta(pixel_a, pixel_b, pixel_index, false)
        };

        diff_count += process_pixel(
            image1, image2, pixel_a, pixel_b, pixel_index, x, y, delta, max_delta,
            options, output.as_deref_mut(), draw_background,
        );
    }

    diff_count
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

    let block_size = calculate_block_size(width, height);
    let blocks_x = (width + block_size - 1) / block_size;
    let blocks_y = (height + block_size - 1) / block_size;

    let a32 = image1.as_u32();
    let b32 = image2.as_u32();
    let max_delta = threshold_to_max_delta(options.threshold);

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
