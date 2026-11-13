//! Scalar diff path for the non-default options: the OKLab metric,
//! `mask` and `window`. The default YIQ SIMD path in `diff.rs`
//! stays free of these checks. Both metrics share one loop, monomorphised per
//! [`Kernel`], and the same two-pass block structure as `diff.rs`.

use crate::antialiasing::{is_antialiased_over_white_px, is_antialiased_px};
use crate::diff::{
    calculate_block_size, color_delta_scalar, compute_gray_pixel_f32, pack_color_pixel,
    pack_gray_pixel, reject_bound,
};
use crate::oklab::Oklab;
use crate::output::fill_gray_rect;
use crate::types::{Background, DiffOptions, DiffResult, Metric, Px};
use crate::window::{max_window, window_side};
use crate::yiq::threshold_to_max_delta_f32;

/// Color metric verdict for two different pixels: 0 within threshold, -1 when
/// the second is darker, 1 when not.
trait Kernel {
    fn delta(&self, pa: u32, pb: u32, index: usize) -> i32;
    fn is_antialiased(&self, image1: Px, image2: Px, x: u32, y: u32) -> bool;
}

/// YIQ with the same kernel and reject bound as the default path, so an
/// all-zero mask reports the same diff pixels.
struct Yiq {
    max_delta: f32,
    reject: u32,
}

impl Kernel for Yiq {
    #[inline(always)]
    fn delta(&self, pa: u32, pb: u32, index: usize) -> i32 {
        if (pa & pb) >> 24 == 0xFF {
            let channel =
                |shift: u32| ((pa >> shift) & 0xFF) as i32 - ((pb >> shift) & 0xFF) as i32;
            let (dr, dg, db) = (channel(0), channel(8), channel(16));
            if ((dr * dr + dg * dg + db * db) as u32) <= self.reject {
                return 0;
            }
        }
        let delta = color_delta_scalar(pa, pb, index);
        if delta.abs() <= self.max_delta as f64 {
            0
        } else if delta < 0.0 {
            -1
        } else {
            1
        }
    }

    #[inline(always)]
    fn is_antialiased(&self, image1: Px, image2: Px, x: u32, y: u32) -> bool {
        is_antialiased_px(image1, image2, x, y) || is_antialiased_px(image2, image1, x, y)
    }
}

impl Kernel for Oklab {
    #[inline(always)]
    fn delta(&self, pa: u32, pb: u32, index: usize) -> i32 {
        Oklab::delta(self, pa, pb, index)
    }

    #[inline(always)]
    fn is_antialiased(&self, image1: Px, image2: Px, x: u32, y: u32) -> bool {
        is_antialiased_over_white_px(image1, image2, x, y)
            || is_antialiased_over_white_px(image2, image1, x, y)
    }
}

/// Diffs `image1` against `image2` honouring `metric`, `mask` and `window`. Sizes and the mask length are checked by the caller.
pub(crate) fn diff_extended(
    image1: Px,
    image2: Px,
    output: Option<&mut [u32]>,
    options: &DiffOptions,
) -> DiffResult {
    match options.metric {
        Metric::Yiq => {
            let max_delta = threshold_to_max_delta_f32(options.threshold);
            let metric = Yiq {
                max_delta,
                reject: reject_bound(max_delta),
            };
            run(&metric, image1, image2, output, options)
        }
        Metric::Oklab => run(
            &Oklab::new(options.threshold),
            image1,
            image2,
            output,
            options,
        ),
    }
}

struct Block {
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
}

fn run<M: Kernel>(
    metric: &M,
    image1: Px,
    image2: Px,
    mut output: Option<&mut [u32]>,
    options: &DiffOptions,
) -> DiffResult {
    let (width, height) = (image1.width, image1.height);
    let total_pixels = width * height;
    let a32 = image1.data;
    let b32 = image2.data;
    let mask = options.mask.as_deref();
    let render = &options.render;
    let transparent = render.background == Background::Transparent;
    let ignored = |i: usize| mask.is_some_and(|m| m[i] != 0);
    let block_size = calculate_block_size(width, height);

    // Cold pass: blocks holding at least one above-threshold, unmasked pixel.
    let mut changed = Vec::new();
    for start_y in (0..height).step_by(block_size as usize) {
        for start_x in (0..width).step_by(block_size as usize) {
            let block = Block {
                start_x,
                start_y,
                end_x: (start_x + block_size).min(width),
                end_y: (start_y + block_size).min(height),
            };
            let has_diff = (block.start_y..block.end_y).any(|y| {
                let row = (y * width) as usize;
                let (from, to) = (row + start_x as usize, row + block.end_x as usize);
                let (ra, rb) = (&a32[from..to], &b32[from..to]);
                let mut x = next_diff(ra, rb, 0);
                while x < ra.len() {
                    let i = from + x;
                    if !ignored(i) && metric.delta(ra[x], rb[x], i) != 0 {
                        return true;
                    }
                    x = next_diff(ra, rb, x + 1);
                }
                false
            });
            if has_diff {
                changed.push(block);
            } else if let Some(out) = output.as_deref_mut() {
                if !transparent {
                    fill_gray_rect(
                        a32,
                        width,
                        out,
                        render.alpha,
                        block.start_x,
                        block.start_y,
                        block.end_x,
                        block.end_y,
                    );
                }
            }
        }
    }

    let window = window_side(options.window, width, height);
    let mut diff_map = window.map(|_| vec![0u8; total_pixels as usize]);
    let mut out32 = output;
    let alpha_scaled = render.alpha as f32 / 255.0;
    let diff_color = pack_color_pixel(&render.diff_color);
    let diff_color_alt =
        pack_color_pixel(render.diff_color_alt.as_ref().unwrap_or(&render.diff_color));
    let aa_color = pack_color_pixel(&render.aa_color);
    let draw_background = !transparent;
    // Equal pixels need visiting only to paint the gray background.
    let skip_equal = out32.is_none() || !draw_background;
    let (mut min_y, mut max_y) = (height, 0);
    let mut diff_count = 0u32;

    // Hot pass: classify and draw every pixel of the changed blocks.
    for block in &changed {
        let block_start = diff_count;
        for y in block.start_y..block.end_y {
            let row = (y * width) as usize;
            let (from, to) = (row + block.start_x as usize, row + block.end_x as usize);
            let mut x = 0;
            while x < to - from {
                if skip_equal {
                    x = next_diff(&a32[from..to], &b32[from..to], x);
                    if x == to - from {
                        break;
                    }
                }
                let (i, column) = (from + x, block.start_x + x as u32);
                x += 1;
                let (pa, pb) = (a32[i], b32[i]);
                let verdict = if pa == pb || ignored(i) {
                    0
                } else {
                    metric.delta(pa, pb, i)
                };

                let color = if verdict == 0 {
                    if !draw_background {
                        continue;
                    }
                    pack_gray_pixel(compute_gray_pixel_f32(pa, alpha_scaled))
                } else if options.antialiasing && metric.is_antialiased(image1, image2, column, y) {
                    aa_color
                } else {
                    diff_count += 1;
                    if let Some(map) = diff_map.as_deref_mut() {
                        map[i] = 1;
                    }
                    if verdict < 0 {
                        diff_color_alt
                    } else {
                        diff_color
                    }
                };
                if let Some(out) = out32.as_deref_mut() {
                    out[i] = color;
                }
            }
        }
        if diff_count > block_start {
            min_y = min_y.min(block.start_y);
            max_y = max_y.max(block.end_y - 1);
        }
    }

    let hit = match (window, diff_map) {
        (Some(n), Some(map)) if diff_count > 0 => {
            Some(max_window(&map, width, height, n, min_y, max_y))
        }
        (Some(_), _) => Some(crate::types::WindowHit {
            x: 0,
            y: 0,
            count: 0,
        }),
        _ => None,
    };
    DiffResult::compared(diff_count, total_pixels, hit)
}

/// First index at or after `i` where `a` and `b` differ, or `a.len()`.
/// Compares 8 pixels per step, which LLVM turns into vector XOR/OR.
#[inline(always)]
fn next_diff(a: &[u32], b: &[u32], mut i: usize) -> usize {
    // Dense diffs land here on almost every call; skip the chunk test for them.
    if i < a.len() && a[i] != b[i] {
        return i;
    }
    while i + 8 <= a.len() {
        let chunk = a[i..i + 8]
            .iter()
            .zip(&b[i..i + 8])
            .fold(0, |acc, (x, y)| acc | (x ^ y));
        if chunk != 0 {
            break;
        }
        i += 8;
    }
    while i < a.len() && a[i] == b[i] {
        i += 1;
    }
    i
}
