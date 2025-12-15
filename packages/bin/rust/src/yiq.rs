//! YIQ color space calculations.
//!
//! Reference: "Measuring perceived color difference using YIQ NTSC transmission color space"
//! Kotsarenko & Ramos (2009) - https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad

pub const YIQ_Y: [f64; 3] = [0.29889531, 0.58662247, 0.11448223];
pub const YIQ_I: [f64; 3] = [0.59597799, -0.2741761, -0.32180189];
pub const YIQ_Q: [f64; 3] = [0.21147017, -0.52261711, 0.31114694];
pub const YIQ_WEIGHTS: [f64; 3] = [0.5053, 0.299, 0.1957];
pub const MAX_YIQ_DELTA: f64 = 35215.0;
pub const COLOR_DELTA_SHIFT: u32 = 12;

const PHI: f64 = 1.618033988749895;
const PHI2: f64 = 2.618033988749895;

#[inline(always)]
pub fn unpack_pixel(pixel: u32) -> (u8, u8, u8, u8) {
    let r = (pixel & 0xFF) as u8;
    let g = ((pixel >> 8) & 0xFF) as u8;
    let b = ((pixel >> 16) & 0xFF) as u8;
    let a = ((pixel >> 24) & 0xFF) as u8;
    (r, g, b, a)
}

#[inline(always)]
pub fn pack_pixel(r: u8, g: u8, b: u8, a: u8) -> u32 {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16) | ((a as u32) << 24)
}

/// Fast YIQ delta for opaque pixels (no alpha blending needed)
#[inline(always)]
pub fn color_delta_opaque(pixel_a: u32, pixel_b: u32) -> f64 {
    let dr = (pixel_a & 0xFF) as f64 - (pixel_b & 0xFF) as f64;
    let dg = ((pixel_a >> 8) & 0xFF) as f64 - ((pixel_b >> 8) & 0xFF) as f64;
    let db = ((pixel_a >> 16) & 0xFF) as f64 - ((pixel_b >> 16) & 0xFF) as f64;

    let y = dr * YIQ_Y[0] + dg * YIQ_Y[1] + db * YIQ_Y[2];
    let i = dr * YIQ_I[0] + dg * YIQ_I[1] + db * YIQ_I[2];
    let q = dr * YIQ_Q[0] + dg * YIQ_Q[1] + db * YIQ_Q[2];

    let delta = YIQ_WEIGHTS[0] * y * y + YIQ_WEIGHTS[1] * i * i + YIQ_WEIGHTS[2] * q * q;

    if y > 0.0 { -delta } else { delta }
}

/// Check if pixel is fully opaque
#[inline(always)]
pub fn is_opaque(pixel: u32) -> bool {
    (pixel >> 24) == 0xFF
}

#[inline]
pub fn color_delta(pixel_a: u32, pixel_b: u32, pixel_index: usize, y_only: bool) -> f64 {
    let (r1, g1, b1, a1) = unpack_pixel(pixel_a);
    let (r2, g2, b2, a2) = unpack_pixel(pixel_b);

    let mut dr = (r1 as f64) - (r2 as f64);
    let mut dg = (g1 as f64) - (g2 as f64);
    let mut db = (b1 as f64) - (b2 as f64);
    let da = (a1 as f64) - (a2 as f64);

    // Fast path: fully opaque pixels with no difference
    if dr == 0.0 && dg == 0.0 && db == 0.0 && da == 0.0 {
        return 0.0;
    }

    // Alpha blending with procedural checkerboard background
    if a1 < 255 || a2 < 255 {
        // Generate checkerboard background color using golden ratio
        let rb = 48.0 + 159.0 * ((pixel_index % 2) as f64);
        let gb = 48.0 + 159.0 * ((((pixel_index as f64) / PHI) as usize & 1) as f64);
        let bb = 48.0 + 159.0 * ((((pixel_index as f64) / PHI2) as usize & 1) as f64);

        dr = ((r1 as f64) * (a1 as f64) - (r2 as f64) * (a2 as f64) - rb * da) / 255.0;
        dg = ((g1 as f64) * (a1 as f64) - (g2 as f64) * (a2 as f64) - gb * da) / 255.0;
        db = ((b1 as f64) * (a1 as f64) - (b2 as f64) * (a2 as f64) - bb * da) / 255.0;
    }

    // Calculate Y (luminance) difference
    let y = dr * YIQ_Y[0] + dg * YIQ_Y[1] + db * YIQ_Y[2];

    if y_only {
        return y;
    }

    // Calculate I and Q differences
    let i = dr * YIQ_I[0] + dg * YIQ_I[1] + db * YIQ_I[2];
    let q = dr * YIQ_Q[0] + dg * YIQ_Q[1] + db * YIQ_Q[2];

    // Weighted perceptual difference
    let delta = YIQ_WEIGHTS[0] * y * y + YIQ_WEIGHTS[1] * i * i + YIQ_WEIGHTS[2] * q * q;

    // Encode lightening/darkening in sign
    if y > 0.0 {
        -delta
    } else {
        delta
    }
}

#[inline]
pub fn color_delta_fixed(pixel_a: u32, pixel_b: u32) -> i64 {
    const SHIFT: i64 = 1 << COLOR_DELTA_SHIFT;

    // Pre-computed fixed-point coefficients
    const Y_R: i64 = (YIQ_Y[0] * (SHIFT as f64)) as i64;
    const Y_G: i64 = (YIQ_Y[1] * (SHIFT as f64)) as i64;
    const Y_B: i64 = (YIQ_Y[2] * (SHIFT as f64)) as i64;
    const I_R: i64 = (YIQ_I[0] * (SHIFT as f64)) as i64;
    const I_G: i64 = (YIQ_I[1] * (SHIFT as f64)) as i64;
    const I_B: i64 = (YIQ_I[2] * (SHIFT as f64)) as i64;
    const Q_R: i64 = (YIQ_Q[0] * (SHIFT as f64)) as i64;
    const Q_G: i64 = (YIQ_Q[1] * (SHIFT as f64)) as i64;
    const Q_B: i64 = (YIQ_Q[2] * (SHIFT as f64)) as i64;
    const W_Y: i64 = (YIQ_WEIGHTS[0] * (SHIFT as f64)) as i64;
    const W_I: i64 = (YIQ_WEIGHTS[1] * (SHIFT as f64)) as i64;
    const W_Q: i64 = (YIQ_WEIGHTS[2] * (SHIFT as f64)) as i64;

    let r1 = (pixel_a & 0xFF) as i64;
    let g1 = ((pixel_a >> 8) & 0xFF) as i64;
    let b1 = ((pixel_a >> 16) & 0xFF) as i64;
    let a1 = ((pixel_a >> 24) & 0xFF) as i64;

    let r2 = (pixel_b & 0xFF) as i64;
    let g2 = ((pixel_b >> 8) & 0xFF) as i64;
    let b2 = ((pixel_b >> 16) & 0xFF) as i64;
    let a2 = ((pixel_b >> 24) & 0xFF) as i64;

    // Blend with white if alpha < 255
    let blend = |c: i64, a: i64| -> i64 {
        if a == 0 {
            255 << COLOR_DELTA_SHIFT
        } else if a < 255 {
            (255 << COLOR_DELTA_SHIFT) + ((c - 255) * a * SHIFT) / 255
        } else {
            c << COLOR_DELTA_SHIFT
        }
    };

    let br1 = blend(r1, a1);
    let bg1 = blend(g1, a1);
    let bb1 = blend(b1, a1);

    let br2 = blend(r2, a2);
    let bg2 = blend(g2, a2);
    let bb2 = blend(b2, a2);

    // YIQ calculation in fixed-point
    let dr = br1 - br2;
    let dg = bg1 - bg2;
    let db = bb1 - bb2;

    let y = (dr * Y_R + dg * Y_G + db * Y_B) >> COLOR_DELTA_SHIFT;
    let i = (dr * I_R + dg * I_G + db * I_B) >> COLOR_DELTA_SHIFT;
    let q = (dr * Q_R + dg * Q_G + db * Q_B) >> COLOR_DELTA_SHIFT;

    // Weighted sum (result still shifted)
    (y * y * W_Y + i * i * W_I + q * q * W_Q) >> (2 * COLOR_DELTA_SHIFT)
}

#[inline]
pub fn threshold_to_max_delta(threshold: f64) -> f64 {
    MAX_YIQ_DELTA * threshold * threshold
}

#[inline]
pub fn threshold_to_max_delta_fixed(threshold: f64) -> i64 {
    let max_delta = threshold_to_max_delta(threshold);
    (max_delta * ((1 << COLOR_DELTA_SHIFT) as f64)) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unpack_pixel() {
        let pixel = 0xFF804020u32; // ABGR = 255, 128, 64, 32 -> R=32, G=64, B=128, A=255
        let (r, g, b, a) = unpack_pixel(pixel);
        assert_eq!(r, 0x20);
        assert_eq!(g, 0x40);
        assert_eq!(b, 0x80);
        assert_eq!(a, 0xFF);
    }

    #[test]
    fn test_pack_pixel() {
        let pixel = pack_pixel(32, 64, 128, 255);
        assert_eq!(pixel, 0xFF804020);
    }

    #[test]
    fn test_identical_pixels_zero_delta() {
        let pixel = 0xFF8080FF; // Opaque pixel
        let delta = color_delta(pixel, pixel, 0, false);
        assert_eq!(delta, 0.0);
    }

    #[test]
    fn test_black_white_delta() {
        let black = 0xFF000000; // Opaque black
        let white = 0xFFFFFFFF; // Opaque white
        let delta = color_delta(black, white, 0, false);
        // Should be close to max delta
        assert!(delta.abs() > 30000.0);
    }

    #[test]
    fn test_threshold_conversion() {
        let threshold = 0.1;
        let max_delta = threshold_to_max_delta(threshold);
        // 35215 * 0.1 * 0.1 = 352.15
        assert!((max_delta - 352.15).abs() < 0.1);
    }
}
