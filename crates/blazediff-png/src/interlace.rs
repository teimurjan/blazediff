//! Adam7 interlace geometry (matching spng's calculate_subimages).

pub const X_START: [u32; 7] = [0, 4, 0, 2, 0, 1, 0];
pub const Y_START: [u32; 7] = [0, 0, 4, 0, 2, 0, 1];
pub const X_DELTA: [u32; 7] = [8, 8, 4, 4, 2, 2, 1];
pub const Y_DELTA: [u32; 7] = [8, 8, 8, 4, 4, 2, 2];

/// (width, height) of each of the 7 passes; empty passes have 0 in one
/// dimension and contribute no scanlines (not even filter bytes).
pub fn pass_dimensions(width: u32, height: u32) -> [(u32, u32); 7] {
    [
        ((width + 7) >> 3, (height + 7) >> 3),
        ((width + 3) >> 3, (height + 7) >> 3),
        ((width + 3) >> 2, (height + 3) >> 3),
        ((width + 1) >> 2, (height + 3) >> 2),
        ((width + 1) >> 1, (height + 1) >> 2),
        (width >> 1, (height + 1) >> 1),
        (width, height >> 1),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pass_pixels_partition_the_image() {
        for (w, h) in [
            (1u32, 1u32),
            (7, 7),
            (8, 8),
            (9, 5),
            (2, 3),
            (16, 1),
            (1, 16),
        ] {
            let total: u64 = pass_dimensions(w, h)
                .iter()
                .map(|&(pw, ph)| pw as u64 * ph as u64)
                .sum();
            assert_eq!(total, w as u64 * h as u64, "{}x{}", w, h);
        }
    }

    #[test]
    fn scatter_covers_every_pixel_once() {
        let (w, h) = (13u32, 9u32);
        let mut seen = vec![0u8; (w * h) as usize];
        for (pass, &(pw, ph)) in pass_dimensions(w, h).iter().enumerate() {
            for i in 0..ph {
                let y = Y_START[pass] + i * Y_DELTA[pass];
                for k in 0..pw {
                    let x = X_START[pass] + k * X_DELTA[pass];
                    seen[(y * w + x) as usize] += 1;
                }
            }
        }
        assert!(seen.iter().all(|&c| c == 1));
    }
}
