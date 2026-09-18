//! The metric end to end: pyramid down, masks up, then the pooled score.

use crate::network::{mask_rows, Level};
use crate::pyramid::{avg_pool_2x2, rgb_from_rgba8, upsample_2x};
use crate::weights::network;
use crate::{MiloError, MiloOptions, MiloOutcome, Rgba8};

/// Pyramid depth: the reference halves three times.
const LEVELS: usize = 4;

/// Fewer rows than this per band and the halo rows each stage recomputes
/// start to dominate, so small images get fewer threads than are available.
const MIN_BAND_ROWS: usize = 16;

/// How many threads to spread bands over.
fn thread_count(options: &MiloOptions) -> usize {
    if cfg!(target_arch = "wasm32") {
        return 1;
    }
    match options.threads {
        Some(threads) if threads > 0 => threads,
        _ => std::thread::available_parallelism().map_or(1, |n| n.get()),
    }
}

/// Split `out`, `height` rows of `width`, into horizontal bands and run `f`
/// over each on its own thread. Returns each band's result in row order, so a
/// caller reducing them sees the same sequence whatever the thread count.
fn for_each_band<T, R, F>(
    out: &mut [T],
    width: usize,
    height: usize,
    threads: usize,
    f: F,
) -> Vec<R>
where
    T: Send,
    R: Send,
    F: Fn(usize, usize, &mut [T]) -> R + Sync,
{
    let bands = threads.clamp(1, height.div_ceil(MIN_BAND_ROWS).max(1));
    let rows_per_band = height.div_ceil(bands);
    let band_of = |i: usize, chunk: &mut [T]| {
        let y0 = i * rows_per_band;
        f(y0, (y0 + rows_per_band).min(height), chunk)
    };

    if bands == 1 {
        return vec![band_of(0, out)];
    }
    std::thread::scope(|scope| {
        let handles: Vec<_> = out
            .chunks_mut(rows_per_band * width)
            .enumerate()
            .map(|(i, chunk)| scope.spawn(move || band_of(i, chunk)))
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().expect("a band panicked"))
            .collect()
    })
}

/// One level's RGB planes and size.
struct Plane {
    rgb: Vec<f32>,
    width: usize,
    height: usize,
}

/// The pyramid from the full image down, coarsest first.
fn pyramid(rgba: Rgba8<'_>) -> Vec<Plane> {
    let mut levels = vec![Plane {
        rgb: rgb_from_rgba8(rgba.data, rgba.width * rgba.height),
        width: rgba.width,
        height: rgba.height,
    }];
    for _ in 1..LEVELS {
        let finest = levels.last().expect("at least one level");
        let (rgb, width, height) = avg_pool_2x2(&finest.rgb, finest.width, finest.height, 3);
        levels.push(Plane { rgb, width, height });
    }
    levels.reverse();
    levels
}

/// The masked error at each pixel, summed over channels, in the order the
/// reference's `(mask * |x - y|).mean(...)` reductions see it.
#[inline]
fn masked_error(mask: f32, reference: &[f32], distorted: &[f32]) -> f32 {
    let channel = |c: usize| mask * (reference[c] - distorted[c]).abs();
    (channel(0) + channel(1)) + channel(2)
}

pub(crate) fn run(
    reference: Rgba8<'_>,
    distorted: Rgba8<'_>,
    options: &MiloOptions,
) -> Result<MiloOutcome, MiloError> {
    reference.validate_pair(distorted)?;
    let threads = thread_count(options);
    let net = network();

    let reference_levels = pyramid(reference);
    let distorted_levels = pyramid(distorted);

    // The reference seeds the coarsest level with a zero mask half its size
    // and upsamples it; zeros upsample to zeros.
    let coarsest = &reference_levels[0];
    let mut mask_in = vec![0.0f32; coarsest.width * coarsest.height];
    let mut mask = Vec::new();

    for (i, (reference, distorted)) in reference_levels.iter().zip(&distorted_levels).enumerate() {
        let level = Level {
            width: reference.width,
            height: reference.height,
            reference: &reference.rgb,
            distorted: &distorted.rgb,
            mask_in: &mask_in,
        };
        mask = vec![0.0f32; level.width * level.height];
        for_each_band(
            &mut mask,
            level.width,
            level.height,
            threads,
            |y0, y1, out| mask_rows(net, &level, y0, y1, out),
        );

        if let Some(finer) = reference_levels.get(i + 1) {
            mask_in = upsample_2x(&mask, level.width, level.height, finer.width, finer.height);
        }
    }

    let finest = reference_levels.last().expect("at least one level");
    let (width, height) = (finest.width, finest.height);
    let (reference_rgb, distorted_rgb) = (&finest.rgb, &distorted_levels.last().unwrap().rgb);
    let scaler_at_zero = net.scaler.apply(0.0);

    let mut error_map = vec![0.0f32; width * height];
    let row_sums = for_each_band(&mut error_map, width, height, threads, |y0, y1, out| {
        let mut sums = Vec::with_capacity(y1 - y0);
        for y in y0..y1 {
            let mut row_sum = 0.0f64;
            let row = y * width;
            for x in 0..width {
                let i = row + x;
                let error = masked_error(mask[i], &reference_rgb[i * 3..], &distorted_rgb[i * 3..]);
                row_sum += error as f64;
                out[i - y0 * width] = net.scaler.apply(error / 3.0) - scaler_at_zero;
            }
            sums.push(row_sum);
        }
        sums
    });

    let total: f64 = row_sums.iter().flatten().sum();
    let raw_error = total / (3 * width * height) as f64;
    // The reference maps in f32: `5 * (1 - scaler(score))`.
    let mos = (5.0f32 * (1.0 - net.scaler.apply(raw_error as f32))) as f64;

    Ok(MiloOutcome {
        raw_error,
        mos,
        mask,
        error_map,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bands_cover_every_row_once_in_order() {
        let (width, height) = (3, 41);
        let mut out = vec![0u32; width * height];
        let results = for_each_band(&mut out, width, height, 8, |y0, y1, chunk| {
            for (i, cell) in chunk.iter_mut().enumerate() {
                *cell = (y0 + i / width) as u32 + 1;
            }
            (y0, y1)
        });
        assert_eq!(results.len(), 3); // 41 rows / 16 minimum = 3 bands
        assert_eq!(results, [(0, 14), (14, 28), (28, 41)]);
        for (i, cell) in out.iter().enumerate() {
            assert_eq!(*cell as usize, i / width + 1);
        }
    }

    #[test]
    fn a_single_thread_runs_inline() {
        let mut out = vec![0u8; 4];
        let results = for_each_band(&mut out, 2, 2, 1, |y0, y1, _| (y0, y1));
        assert_eq!(results, [(0, 2)]);
    }
}
