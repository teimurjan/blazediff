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
