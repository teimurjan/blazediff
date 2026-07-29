//! YIQ color space calculations.
//!
//! Reference: "Measuring perceived color difference using YIQ NTSC transmission color space"
//! Kotsarenko & Ramos (2009) - https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad

pub const YIQ_Y: [f64; 3] = [0.29889531, 0.58662247, 0.11448223];
pub const YIQ_I: [f64; 3] = [0.59597799, -0.2741761, -0.32180189];
pub const YIQ_Q: [f64; 3] = [0.21147017, -0.52261711, 0.31114694];
pub const YIQ_WEIGHTS: [f64; 3] = [0.5053, 0.299, 0.1957];
pub const MAX_YIQ_DELTA: f64 = 35215.0;
pub const MAX_YIQ_DELTA_F32: f32 = 35215.0;

const PHI: f64 = 1.618033988749895;
const PHI2: f64 = 2.618033988749895;

/// Red component of the procedural checkerboard background.
///
/// The general form is `48 + 159 * (k & 1)` where `k` is the *byte* offset of
/// the pixel. Since `k = pixel_index * 4` is always even, `k & 1` is always 0
/// and this term is constant, matching `@blazediff/core`, where `k` likewise
/// indexes a byte array.
const CHECKER_RB: f64 = 48.0;

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

/// Check if pixel is fully opaque
#[inline(always)]
pub fn is_opaque(pixel: u32) -> bool {
    (pixel >> 24) == 0xFF
}

/// Per-channel deltas after alpha handling: the shared core of
/// [`color_delta`] and [`brightness_delta`].
///
/// Returns `None` when the two pixels are byte-identical (including alpha),
/// mirroring the `if (!dr && !dg && !db && !da) return 0` early-out in
/// `@blazediff/core`.
///
/// Semi-transparent pixels are blended against the procedural golden-ratio
/// checkerboard. `pixel_index` is the **pixel** index; the checkerboard terms
/// are driven by the byte offset `k = pixel_index * 4`, exactly as in the JS
/// reference where `k` indexes an RGBA byte array.
///
/// The index term is computed in `f64` deliberately: `f32` carries only a
/// 24-bit mantissa (exact to 16_777_216), while `k / PHI` exceeds that from
/// pixel_index 4_000_000 onward (a 2000x2000 image), after which an `f32`
/// implementation silently selects the wrong checkerboard squares.
#[inline(always)]
fn channel_deltas(pixel_a: u32, pixel_b: u32, pixel_index: usize) -> Option<(f64, f64, f64)> {
    let (r1, g1, b1, a1) = unpack_pixel(pixel_a);
    let (r2, g2, b2, a2) = unpack_pixel(pixel_b);

    let dr = (r1 as f64) - (r2 as f64);
    let dg = (g1 as f64) - (g2 as f64);
    let db = (b1 as f64) - (b2 as f64);
    let da = (a1 as f64) - (a2 as f64);

    if dr == 0.0 && dg == 0.0 && db == 0.0 && da == 0.0 {
        return None;
    }

    if a1 == 255 && a2 == 255 {
        return Some((dr, dg, db));
    }

    let k = (pixel_index as f64) * 4.0;
    // Truncation toward zero matches JS `| 0`. Only the low bit is consumed,
    // which `| 0`'s 32-bit wraparound would preserve anyway.
    let gb = 48.0 + 159.0 * (((k / PHI) as u64 & 1) as f64);
    let bb = 48.0 + 159.0 * (((k / PHI2) as u64 & 1) as f64);

    Some((
        ((r1 as f64) * (a1 as f64) - (r2 as f64) * (a2 as f64) - CHECKER_RB * da) / 255.0,
        ((g1 as f64) * (a1 as f64) - (g2 as f64) * (a2 as f64) - gb * da) / 255.0,
        ((b1 as f64) * (a1 as f64) - (b2 as f64) * (a2 as f64) - bb * da) / 255.0,
    ))
}

/// Perceptual YIQ delta between two pixels: the canonical scalar kernel.
///
/// Bit-for-bit port of `colorDelta` from `@blazediff/core`, computed in `f64`
/// because the JS reference uses doubles throughout. The sign encodes the
/// direction of change: negative lightens, positive darkens.
#[inline]
pub fn color_delta(pixel_a: u32, pixel_b: u32, pixel_index: usize) -> f64 {
    let (dr, dg, db) = match channel_deltas(pixel_a, pixel_b, pixel_index) {
        Some(d) => d,
        None => return 0.0,
    };

    let y = dr * YIQ_Y[0] + dg * YIQ_Y[1] + db * YIQ_Y[2];
    let i = dr * YIQ_I[0] + dg * YIQ_I[1] + db * YIQ_I[2];
    let q = dr * YIQ_Q[0] + dg * YIQ_Q[1] + db * YIQ_Q[2];

    let delta = YIQ_WEIGHTS[0] * y * y + YIQ_WEIGHTS[1] * i * i + YIQ_WEIGHTS[2] * q * q;

    if y > 0.0 {
        -delta
    } else {
        delta
    }
}

/// Y-only (luminance) delta, used by anti-aliasing detection.
///
/// Port of `brightnessDelta` from `@blazediff/core`. When called on a
/// centre/neighbour pair, `pixel_index` must be the **centre** pixel's index.
/// the JS passes the centre pixel's byte offset for the checkerboard terms even
/// though the second pixel is the neighbour.
#[inline]
pub fn brightness_delta(pixel_a: u32, pixel_b: u32, pixel_index: usize) -> f64 {
    match channel_deltas(pixel_a, pixel_b, pixel_index) {
        Some((dr, dg, db)) => dr * YIQ_Y[0] + dg * YIQ_Y[1] + db * YIQ_Y[2],
        None => 0.0,
    }
}

#[inline]
pub fn threshold_to_max_delta(threshold: f64) -> f64 {
    MAX_YIQ_DELTA * threshold * threshold
}

#[inline]
pub fn threshold_to_max_delta_f32(threshold: f64) -> f32 {
    MAX_YIQ_DELTA_F32 * (threshold * threshold) as f32
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
        let delta = color_delta(pixel, pixel, 0);
        assert_eq!(delta, 0.0);
    }

    #[test]
    fn test_black_white_delta() {
        let black = 0xFF000000; // Opaque black
        let white = 0xFFFFFFFF; // Opaque white
        let delta = color_delta(black, white, 0);
        // Should be close to max delta
        assert!(delta.abs() > 30000.0);
    }

    // ── Parity with @blazediff/core ──────────────────────────────────────────
    //
    // Every expected value below was produced by running the reference
    // `colorDelta` / `brightnessDelta` from packages/core/src/index.ts. They
    // are the contract between the JS and Rust engines; if one of these drifts,
    // the two packages have started disagreeing again.

    /// Tolerance is tight because both sides compute in f64, so these should
    /// agree to near machine epsilon, not merely "close enough".
    const PARITY_EPS: f64 = 1e-9;

    #[test]
    fn test_opaque_matches_js_reference() {
        // (128,128,128,255) vs (100,100,100,255)
        let a = pack_pixel(128, 128, 128, 255);
        let b = pack_pixel(100, 100, 100, 255);
        assert!((color_delta(a, b, 0) - -396.15520792310406).abs() < PARITY_EPS);
    }

    #[test]
    fn test_blended_matches_js_reference() {
        let a = pack_pixel(200, 100, 50, 128);
        let b = pack_pixel(200, 100, 50, 255);
        // Same pixels, different positions: the checkerboard shifts the result.
        assert!((color_delta(a, b, 0) - 1153.478327410409).abs() < PARITY_EPS);
        assert!((color_delta(a, b, 1) - 1708.0302351603877).abs() < PARITY_EPS);
        assert!((color_delta(a, b, 2) - 1708.0302351603877).abs() < PARITY_EPS);
        assert!((color_delta(a, b, 3) - -1473.7036513888258).abs() < PARITY_EPS);
    }

    #[test]
    fn test_both_semi_transparent_matches_js_reference() {
        let a = pack_pixel(10, 20, 30, 64);
        let b = pack_pixel(40, 50, 60, 192);
        assert!((color_delta(a, b, 7) - -1214.8615274328758).abs() < PARITY_EPS);
    }

    /// Guards the f64 index math. An f32 implementation diverges from
    /// pixel_index 4_000_000 onward (a 2000x2000 image): `k / PHI` passes f32's
    /// 24-bit exact-integer limit and selects the wrong checkerboard square.
    /// At index 4_000_000 f32 computes gbit=0 where f64 gives gbit=1.
    #[test]
    fn test_large_pixel_index_uses_f64_checkerboard() {
        let a = pack_pixel(10, 20, 30, 64);
        let b = pack_pixel(40, 50, 60, 192);
        assert!((color_delta(a, b, 4_000_000) - -1214.8615274328758).abs() < PARITY_EPS);
        assert!((color_delta(a, b, 4_000_001) - -249.8771422513972).abs() < PARITY_EPS);
    }

    #[test]
    fn test_identical_semi_transparent_is_zero() {
        let p = pack_pixel(10, 20, 30, 64);
        assert_eq!(color_delta(p, p, 5), 0.0);
        assert_eq!(brightness_delta(p, p, 5), 0.0);
    }

    #[test]
    fn test_brightness_delta_matches_js_reference() {
        let a = pack_pixel(200, 100, 50, 128);
        let b = pack_pixel(200, 100, 50, 255);
        assert!((brightness_delta(a, b, 0) - -37.93336604917647).abs() < PARITY_EPS);
        assert!((brightness_delta(a, b, 3) - 8.520232133999997).abs() < PARITY_EPS);

        let oa = pack_pixel(128, 128, 128, 255);
        let ob = pack_pixel(100, 100, 100, 255);
        assert!((brightness_delta(oa, ob, 0) - 28.000000280000002).abs() < PARITY_EPS);
    }

    #[test]
    fn test_alpha_only_difference_is_detected() {
        // Identical RGB, differing alpha: must not be treated as identical.
        let a = pack_pixel(100, 150, 200, 128);
        let b = pack_pixel(100, 150, 200, 129);
        assert_ne!(color_delta(a, b, 0), 0.0);
    }

    #[test]
    fn test_threshold_conversion() {
        let threshold = 0.1;
        let max_delta = threshold_to_max_delta(threshold);
        // 35215 * 0.1 * 0.1 = 352.15
        assert!((max_delta - 352.15).abs() < 0.1);
    }
}
