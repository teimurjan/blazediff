//! Diff visualization output.

use crate::types::Image;
use crate::yiq::{pack_pixel, YIQ_Y};

#[inline(always)]
pub fn draw_pixel(output: &mut Image, pixel_index: usize, color: &[u8; 3]) {
    let pos = pixel_index * 4;
    output.data[pos] = color[0];
    output.data[pos + 1] = color[1];
    output.data[pos + 2] = color[2];
    output.data[pos + 3] = 255;
}

#[inline(always)]
pub fn draw_pixel_u32(output: &mut Image, pixel_index: usize, color: &[u8; 3]) {
    let pixel = pack_pixel(color[0], color[1], color[2], 255);
    output.as_u32_mut()[pixel_index] = pixel;
}

#[inline]
pub fn draw_gray_pixel(source: &Image, pixel_index: usize, alpha: f64, output: &mut Image) {
    let pos = pixel_index * 4;
    let r = source.data[pos] as f64;
    let g = source.data[pos + 1] as f64;
    let b = source.data[pos + 2] as f64;
    let a = source.data[pos + 3] as f64;

    // Calculate luminance using YIQ Y coefficients
    let luminance = r * YIQ_Y[0] + g * YIQ_Y[1] + b * YIQ_Y[2];

    // Blend with white based on alpha parameter
    let value = 255.0 + ((luminance - 255.0) * alpha * a) / 255.0;
    let gray = value.clamp(0.0, 255.0) as u8;

    output.data[pos] = gray;
    output.data[pos + 1] = gray;
    output.data[pos + 2] = gray;
    output.data[pos + 3] = 255;
}

#[inline]
pub fn draw_gray_pixel_u32(source: &Image, pixel_index: usize, alpha: f64, output: &mut Image) {
    let source_pixel = source.as_u32()[pixel_index];

    let r = (source_pixel & 0xFF) as f64;
    let g = ((source_pixel >> 8) & 0xFF) as f64;
    let b = ((source_pixel >> 16) & 0xFF) as f64;
    let a = ((source_pixel >> 24) & 0xFF) as f64;

    // Calculate luminance using YIQ Y coefficients
    let luminance = r * YIQ_Y[0] + g * YIQ_Y[1] + b * YIQ_Y[2];

    // Blend with white based on alpha parameter
    let value = 255.0 + ((luminance - 255.0) * alpha * a) / 255.0;
    let gray = value.clamp(0.0, 255.0) as u8;

    let pixel = pack_pixel(gray, gray, gray, 255);
    output.as_u32_mut()[pixel_index] = pixel;
}

pub fn fill_gray(source: &Image, alpha: f64, output: &mut Image) {
    let len = (source.width * source.height) as usize;
    for i in 0..len {
        draw_gray_pixel_u32(source, i, alpha, output);
    }
}

pub fn fill_block_gray(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    let width = source.width;
    for y in start_y..end_y {
        for x in start_x..end_x {
            let pixel_index = (y * width + x) as usize;
            draw_gray_pixel_u32(source, pixel_index, alpha, output);
        }
    }
}

pub fn fill_block_gray_optimized(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    #[cfg(target_arch = "aarch64")]
    {
        fill_block_gray_neon(source, output, alpha, start_x, start_y, end_x, end_y);
    }

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
            unsafe {
                fill_block_gray_avx2(source, output, alpha, start_x, start_y, end_x, end_y);
            }
        } else if is_x86_feature_detected!("sse4.1") {
            unsafe {
                fill_block_gray_sse(source, output, alpha, start_x, start_y, end_x, end_y);
            }
        } else {
            fill_block_gray_scalar(source, output, alpha, start_x, start_y, end_x, end_y);
        }
    }

    #[cfg(not(any(target_arch = "aarch64", target_arch = "x86_64")))]
    {
        fill_block_gray_scalar(source, output, alpha, start_x, start_y, end_x, end_y);
    }
}

const YIQ_Y_F32: [f32; 3] = [0.29889531, 0.58662247, 0.11448223];

/// NEON implementation - processes 4 pixels at a time
#[cfg(target_arch = "aarch64")]
#[inline]
fn fill_block_gray_neon(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    use std::arch::aarch64::*;

    let width = source.width;
    let source_pixels = source.as_u32();
    let output_pixels = output.as_u32_mut();
    let alpha_scaled = (alpha / 255.0) as f32;

    unsafe {
        let mask_ff = vdupq_n_u32(0xFF);
        let v255 = vdupq_n_f32(255.0);
        let alpha_vec = vdupq_n_f32(alpha_scaled);
        let alpha_byte = vdupq_n_u32(0xFF000000);

        for y in start_y..end_y {
            let row_start = (y * width + start_x) as usize;
            let row_width = (end_x - start_x) as usize;
            let mut offset = 0usize;

            let src_ptr = source_pixels.as_ptr().add(row_start);
            let dst_ptr = output_pixels.as_mut_ptr().add(row_start);

            // Process 4 pixels at a time
            while offset + 4 <= row_width {
                let pixels = vld1q_u32(src_ptr.add(offset));

                // Extract RGBA
                let r = vcvtq_f32_u32(vandq_u32(pixels, mask_ff));
                let g = vcvtq_f32_u32(vandq_u32(vshrq_n_u32(pixels, 8), mask_ff));
                let b = vcvtq_f32_u32(vandq_u32(vshrq_n_u32(pixels, 16), mask_ff));
                let a = vcvtq_f32_u32(vshrq_n_u32(pixels, 24));

                // Luminance: Y = 0.299*R + 0.587*G + 0.114*B
                let luminance = vfmaq_n_f32(
                    vfmaq_n_f32(vmulq_n_f32(r, YIQ_Y_F32[0]), g, YIQ_Y_F32[1]),
                    b, YIQ_Y_F32[2]
                );

                // Gray = 255 + (luminance - 255) * alpha_scaled * pixel_alpha
                let gray_f = vfmaq_f32(v255, vsubq_f32(luminance, v255), vmulq_f32(alpha_vec, a));
                let gray_clamped = vminq_f32(vmaxq_f32(gray_f, vdupq_n_f32(0.0)), v255);
                let gray_u32 = vcvtq_u32_f32(gray_clamped);

                // Pack as RGBA (gray, gray, gray, 255)
                let result = vorrq_u32(
                    vorrq_u32(
                        vorrq_u32(gray_u32, vshlq_n_u32(gray_u32, 8)),
                        vshlq_n_u32(gray_u32, 16)
                    ),
                    alpha_byte
                );

                vst1q_u32(dst_ptr.add(offset), result);
                offset += 4;
            }

            // Scalar remainder
            while offset < row_width {
                let idx = row_start + offset;
                let pixel = source_pixels[idx];
                let gray = compute_gray_f32_fast(pixel, alpha_scaled);
                output_pixels[idx] = pack_gray_u32(gray);
                offset += 1;
            }
        }
    }
}

/// AVX2 implementation - processes 8 pixels at a time
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
#[inline]
unsafe fn fill_block_gray_avx2(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    use std::arch::x86_64::*;

    let width = source.width;
    let source_pixels = source.as_u32();
    let output_pixels = output.as_u32_mut();
    let alpha_scaled = (alpha / 255.0) as f32;

    let mask_ff = _mm256_set1_epi32(0xFF);
    let v255 = _mm256_set1_ps(255.0);
    let zero = _mm256_setzero_ps();
    let alpha_vec = _mm256_set1_ps(alpha_scaled);
    let alpha_byte = _mm256_set1_epi32(0xFF000000u32 as i32);
    let y_r = _mm256_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm256_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm256_set1_ps(YIQ_Y_F32[2]);

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        let src_ptr = source_pixels.as_ptr().add(row_start);
        let dst_ptr = output_pixels.as_mut_ptr().add(row_start);

        // Process 8 pixels at a time
        while offset + 8 <= row_width {
            let pixels = _mm256_loadu_si256(src_ptr.add(offset) as *const __m256i);

            // Extract RGBA
            let r = _mm256_cvtepi32_ps(_mm256_and_si256(pixels, mask_ff));
            let g = _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(pixels, 8), mask_ff));
            let b = _mm256_cvtepi32_ps(_mm256_and_si256(_mm256_srli_epi32(pixels, 16), mask_ff));
            let a = _mm256_cvtepi32_ps(_mm256_srli_epi32(pixels, 24));

            // Luminance using FMA
            let luminance = _mm256_fmadd_ps(r, y_r, _mm256_fmadd_ps(g, y_g, _mm256_mul_ps(b, y_b)));

            // Gray = 255 + (luminance - 255) * alpha_scaled * pixel_alpha
            let gray_f = _mm256_fmadd_ps(
                _mm256_sub_ps(luminance, v255),
                _mm256_mul_ps(alpha_vec, a),
                v255
            );
            let gray_clamped = _mm256_min_ps(_mm256_max_ps(gray_f, zero), v255);
            let gray_u32 = _mm256_cvtps_epi32(gray_clamped);

            // Pack as RGBA
            let result = _mm256_or_si256(
                _mm256_or_si256(
                    _mm256_or_si256(gray_u32, _mm256_slli_epi32(gray_u32, 8)),
                    _mm256_slli_epi32(gray_u32, 16)
                ),
                alpha_byte
            );

            _mm256_storeu_si256(dst_ptr.add(offset) as *mut __m256i, result);
            offset += 8;
        }

        // Process remaining 4 pixels with SSE
        if offset + 4 <= row_width {
            fill_row_gray_sse4(source_pixels, output_pixels, row_start, offset, alpha_scaled);
            offset += 4;
        }

        // Scalar remainder
        while offset < row_width {
            let idx = row_start + offset;
            let pixel = source_pixels[idx];
            let gray = compute_gray_f32_fast(pixel, alpha_scaled);
            output_pixels[idx] = pack_gray_u32(gray);
            offset += 1;
        }
    }
}

/// SSE helper for 4-pixel chunk
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn fill_row_gray_sse4(
    source_pixels: &[u32],
    output_pixels: &mut [u32],
    row_start: usize,
    offset: usize,
    alpha_scaled: f32,
) {
    use std::arch::x86_64::*;

    let mask_ff = _mm_set1_epi32(0xFF);
    let v255 = _mm_set1_ps(255.0);
    let zero = _mm_setzero_ps();
    let alpha_vec = _mm_set1_ps(alpha_scaled);
    let alpha_byte = _mm_set1_epi32(0xFF000000u32 as i32);
    let y_r = _mm_set1_ps(YIQ_Y_F32[0]);
    let y_g = _mm_set1_ps(YIQ_Y_F32[1]);
    let y_b = _mm_set1_ps(YIQ_Y_F32[2]);

    let src_ptr = source_pixels.as_ptr().add(row_start + offset);
    let dst_ptr = output_pixels.as_mut_ptr().add(row_start + offset);

    let pixels = _mm_loadu_si128(src_ptr as *const __m128i);

    let r = _mm_cvtepi32_ps(_mm_and_si128(pixels, mask_ff));
    let g = _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(pixels, 8), mask_ff));
    let b = _mm_cvtepi32_ps(_mm_and_si128(_mm_srli_epi32(pixels, 16), mask_ff));
    let a = _mm_cvtepi32_ps(_mm_srli_epi32(pixels, 24));

    let luminance = _mm_add_ps(_mm_add_ps(_mm_mul_ps(r, y_r), _mm_mul_ps(g, y_g)), _mm_mul_ps(b, y_b));
    let gray_f = _mm_add_ps(v255, _mm_mul_ps(_mm_sub_ps(luminance, v255), _mm_mul_ps(alpha_vec, a)));
    let gray_clamped = _mm_min_ps(_mm_max_ps(gray_f, zero), v255);
    let gray_u32 = _mm_cvtps_epi32(gray_clamped);

    let result = _mm_or_si128(
        _mm_or_si128(
            _mm_or_si128(gray_u32, _mm_slli_epi32(gray_u32, 8)),
            _mm_slli_epi32(gray_u32, 16)
        ),
        alpha_byte
    );

    _mm_storeu_si128(dst_ptr as *mut __m128i, result);
}

/// SSE implementation - processes 4 pixels at a time
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "sse4.1")]
#[inline]
unsafe fn fill_block_gray_sse(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    let width = source.width;
    let source_pixels = source.as_u32();
    let output_pixels = output.as_u32_mut();
    let alpha_scaled = (alpha / 255.0) as f32;

    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let row_width = (end_x - start_x) as usize;
        let mut offset = 0usize;

        while offset + 4 <= row_width {
            fill_row_gray_sse4(source_pixels, output_pixels, row_start, offset, alpha_scaled);
            offset += 4;
        }

        while offset < row_width {
            let idx = row_start + offset;
            let pixel = source_pixels[idx];
            let gray = compute_gray_f32_fast(pixel, alpha_scaled);
            output_pixels[idx] = pack_gray_u32(gray);
            offset += 1;
        }
    }
}

/// Scalar fallback
#[cfg(any(target_arch = "x86_64", not(target_arch = "aarch64")))]
fn fill_block_gray_scalar(
    source: &Image,
    output: &mut Image,
    alpha: f64,
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
) {
    let width = source.width;
    let source_pixels = source.as_u32();
    let output_pixels = output.as_u32_mut();
    let alpha_scaled = (alpha / 255.0) as f32;

    for y in start_y..end_y {
        for x in start_x..end_x {
            let idx = (y * width + x) as usize;
            let pixel = source_pixels[idx];
            let gray = compute_gray_f32_fast(pixel, alpha_scaled);
            output_pixels[idx] = pack_gray_u32(gray);
        }
    }
}

#[inline(always)]
fn compute_gray_f32_fast(pixel: u32, alpha_scaled: f32) -> u8 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    let a = ((pixel >> 24) & 0xFF) as f32;

    let luminance = r * YIQ_Y_F32[0] + g * YIQ_Y_F32[1] + b * YIQ_Y_F32[2];
    let gray = 255.0 + (luminance - 255.0) * alpha_scaled * a;
    gray.clamp(0.0, 255.0) as u8
}

#[inline(always)]
fn pack_gray_u32(gray: u8) -> u32 {
    (gray as u32) | ((gray as u32) << 8) | ((gray as u32) << 16) | 0xFF000000
}

pub fn clear_transparent(output: &mut Image) {
    output.data.fill(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_draw_pixel() {
        let mut output = Image::new(10, 10);
        draw_pixel(&mut output, 0, &[255, 0, 0]);

        assert_eq!(output.data[0], 255); // R
        assert_eq!(output.data[1], 0); // G
        assert_eq!(output.data[2], 0); // B
        assert_eq!(output.data[3], 255); // A
    }

    #[test]
    fn test_draw_gray_pixel() {
        let mut source = Image::new(10, 10);
        let mut output = Image::new(10, 10);

        // Set source pixel to white
        source.data[0] = 255;
        source.data[1] = 255;
        source.data[2] = 255;
        source.data[3] = 255;

        draw_gray_pixel(&source, 0, 0.1, &mut output);

        // White should stay near white with low alpha
        assert!(output.data[0] > 250);
        assert_eq!(output.data[0], output.data[1]); // Grayscale
        assert_eq!(output.data[1], output.data[2]); // Grayscale
    }

    #[test]
    fn test_clear_transparent() {
        let mut output = Image::new(10, 10);
        output.data.fill(255);

        clear_transparent(&mut output);

        assert!(output.data.iter().all(|&x| x == 0));
    }
}
