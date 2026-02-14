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
    let width = source.width;
    let source_pixels = source.as_u32();
    let output_pixels = output.as_u32_mut();

    let alpha_f32 = alpha as f32;
    let inv_255 = 1.0f32 / 255.0f32;

    let yiq_y_0 = YIQ_Y[0] as f32;
    let yiq_y_1 = YIQ_Y[1] as f32;
    let yiq_y_2 = YIQ_Y[2] as f32;

    let mut y = start_y;

    while y + 4 <= end_y {
        let base_idx = (y * width + start_x) as usize;

        let mut x = start_x;
        while x + 4 <= end_x {
            let idx = base_idx + (x - start_x) as usize;

            let p0 = source_pixels[idx];
            let p1 = source_pixels[idx + 1];
            let p2 = source_pixels[idx + 2];
            let p3 = source_pixels[idx + 3];

            let gray0 = compute_gray_f32(p0, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray1 = compute_gray_f32(p1, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray2 = compute_gray_f32(p2, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray3 = compute_gray_f32(p3, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);

            output_pixels[idx] = pack_pixel(gray0, gray0, gray0, 255);
            output_pixels[idx + 1] = pack_pixel(gray1, gray1, gray1, 255);
            output_pixels[idx + 2] = pack_pixel(gray2, gray2, gray2, 255);
            output_pixels[idx + 3] = pack_pixel(gray3, gray3, gray3, 255);

            x += 4;
        }

        while x < end_x {
            let idx = (y * width + x) as usize;
            let pixel = source_pixels[idx];
            let gray = compute_gray_f32(pixel, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            output_pixels[idx] = pack_pixel(gray, gray, gray, 255);
            x += 1;
        }

        y += 4;
    }

    while y < end_y {
        let mut x = start_x;
        let base_idx = (y * width + start_x) as usize;

        while x + 4 <= end_x {
            let idx = base_idx + (x - start_x) as usize;

            let p0 = source_pixels[idx];
            let p1 = source_pixels[idx + 1];
            let p2 = source_pixels[idx + 2];
            let p3 = source_pixels[idx + 3];

            let gray0 = compute_gray_f32(p0, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray1 = compute_gray_f32(p1, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray2 = compute_gray_f32(p2, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            let gray3 = compute_gray_f32(p3, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);

            output_pixels[idx] = pack_pixel(gray0, gray0, gray0, 255);
            output_pixels[idx + 1] = pack_pixel(gray1, gray1, gray1, 255);
            output_pixels[idx + 2] = pack_pixel(gray2, gray2, gray2, 255);
            output_pixels[idx + 3] = pack_pixel(gray3, gray3, gray3, 255);

            x += 4;
        }

        while x < end_x {
            let idx = (y * width + x) as usize;
            let pixel = source_pixels[idx];
            let gray = compute_gray_f32(pixel, alpha_f32, inv_255, yiq_y_0, yiq_y_1, yiq_y_2);
            output_pixels[idx] = pack_pixel(gray, gray, gray, 255);
            x += 1;
        }

        y += 1;
    }
}

#[inline(always)]
fn compute_gray_f32(
    pixel: u32,
    alpha: f32,
    inv_255: f32,
    yiq_y_0: f32,
    yiq_y_1: f32,
    yiq_y_2: f32,
) -> u8 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    let a = ((pixel >> 24) & 0xFF) as f32;

    let luminance = r * yiq_y_0 + g * yiq_y_1 + b * yiq_y_2;
    let value = 255.0f32 + (luminance - 255.0f32) * alpha * a * inv_255;

    value.clamp(0.0f32, 255.0f32) as u8
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
