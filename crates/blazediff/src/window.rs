//! `window`: the N×N window with the most diff pixels (pixelmatch 8's `windowSize`).

use crate::types::WindowHit;

/// Window side for `window`, clamped to [1, min(width, height)].
pub(crate) fn window_side(window: Option<u32>, width: u32, height: u32) -> Option<u32> {
    window.map(|n| n.max(1).min(width).min(height))
}

/// The n×n window with the most counted diff pixels (`diff_map[i] == 1`):
/// its top-left corner and count. Ties keep the first window in row-major
/// order. Only rows `min_y..=max_y` hold diffs, so the scan stays in the
/// bands that can be non-zero.
pub(crate) fn max_window(
    diff_map: &[u8],
    width: u32,
    height: u32,
    n: u32,
    min_y: u32,
    max_y: u32,
) -> WindowHit {
    let (width, n) = (width as usize, n as usize);
    let mut col_sum = vec![0u32; width];
    let y_end = (height as usize - 1).min(max_y as usize + n - 1);
    let mut best = WindowHit {
        x: 0,
        y: 0,
        count: 0,
    };
    // Diff pixels in the current n-row band: an upper bound for every window in it.
    let mut band_total = 0u32;

    for y in min_y as usize..=y_end {
        let row = &diff_map[y * width..(y + 1) * width];
        if y >= n {
            let leaving = &diff_map[(y - n) * width..(y - n + 1) * width];
            for ((sum, &enter), &leave) in col_sum.iter_mut().zip(row).zip(leaving) {
                *sum = *sum + enter as u32 - leave as u32;
                band_total = band_total + enter as u32 - leave as u32;
            }
        } else {
            for (sum, &enter) in col_sum.iter_mut().zip(row) {
                *sum += enter as u32;
                band_total += enter as u32;
            }
            if y < n - 1 {
                continue;
            }
        }

        if band_total <= best.count {
            continue;
        }

        let mut window_sum: u32 = col_sum[..n - 1].iter().sum();
        for x in n - 1..width {
            window_sum += col_sum[x];
            if window_sum > best.count {
                best = WindowHit {
                    x: (x + 1 - n) as u32,
                    y: (y + 1 - n) as u32,
                    count: window_sum,
                };
            }
            window_sum -= col_sum[x + 1 - n];
        }
    }

    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn brute(map: &[u8], width: u32, height: u32, n: u32) -> WindowHit {
        let (w, h, n) = (width as usize, height as usize, n as usize);
        let mut best = WindowHit {
            x: 0,
            y: 0,
            count: 0,
        };
        for y in 0..=h - n {
            for x in 0..=w - n {
                let count: u32 = (0..n)
                    .map(|dy| {
                        map[(y + dy) * w + x..(y + dy) * w + x + n]
                            .iter()
                            .map(|&v| v as u32)
                            .sum::<u32>()
                    })
                    .sum();
                if count > best.count {
                    best = WindowHit {
                        x: x as u32,
                        y: y as u32,
                        count,
                    };
                }
            }
        }
        best
    }

    #[test]
    fn matches_brute_force() {
        let (width, height) = (37u32, 23u32);
        let mut state = 7u32;
        let map: Vec<u8> = (0..width * height)
            .map(|_| {
                state = state.wrapping_mul(1664525).wrapping_add(1013904223);
                u8::from(state >> 28 == 0)
            })
            .collect();
        let rows: Vec<u32> = (0..height)
            .filter(|&y| map[(y * width) as usize..((y + 1) * width) as usize].contains(&1))
            .collect();
        let (min_y, max_y) = (rows[0], *rows.last().unwrap());
        for n in [1, 2, 5, 8, 23] {
            assert_eq!(
                max_window(&map, width, height, n, min_y, max_y),
                brute(&map, width, height, n),
                "n={n}"
            );
        }
    }

    #[test]
    fn clamps_the_side() {
        assert_eq!(window_side(None, 10, 10), None);
        assert_eq!(window_side(Some(0), 10, 20), Some(1));
        assert_eq!(window_side(Some(50), 10, 20), Some(10));
    }
}
