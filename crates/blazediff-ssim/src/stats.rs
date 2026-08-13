//! One pyramid level's local statistics, in a single streaming pass.
//!
//! The five moments SSIM needs — `µ1`, `µ2`, `σ1²`, `σ2²`, `σ12` — are five
//! separable convolutions of the same window over five planes derived from the
//! same two inputs. Running them as five independent `convolve_same_symmetric`
//! calls costs eleven full-size intermediates per level and streams each of them
//! through DRAM at least twice; at five scales and three channels that is the
//! dominant cost of the whole metric, not the arithmetic.
//!
//! So the passes are interleaved instead. Each input row is filtered
//! horizontally once, into a ring of `taps` rows per plane, and the vertical
//! tap-accumulation for output row `y` reads that ring — which is a few hundred
//! kilobytes and stays in cache — rather than a full-size scratch plane. Only
//! the two output maps ever reach memory.
//!
//! Every arithmetic step keeps the order [`super::convolve`] uses, tap by
//! ascending tap, so this is bit-identical to the unfused path rather than
//! merely close: `super::multiscale`'s parity with the MATLAB reference is
//! inherited, not re-argued.

use super::convolve::{horizontal_row_symmetric, reflect};
use super::simd::{square_and_cross, sum, vertical_taps_combine};

/// The planes filtered per level: both lumas, both squares, and the cross
/// product.
const PLANES: usize = 5;

/// Reusable row buffers for [`scale_statistics_into`].
///
/// Sized once for the largest level a caller will ask for and then re-sliced
/// per level, so descending the pyramid allocates nothing.
pub(crate) struct Workspace {
    /// `PLANES × taps` horizontally filtered rows — one ring per plane.
    ring: Vec<f32>,
    /// Three product rows for the current input row.
    products: Vec<f32>,
    /// Where in a plane each tap's row sits, for the current output row.
    rows: Vec<usize>,
    width: usize,
    taps: usize,
}

impl Workspace {
    /// Room for levels up to `width` wide with a `taps`-wide window.
    pub(crate) fn new(width: usize, taps: usize) -> Self {
        Self {
            ring: vec![0f32; PLANES * taps * width],
            products: vec![0f32; 3 * width],
            rows: vec![0usize; taps],
            width,
            taps,
        }
    }
}

/// Per-pixel SSIM and contrast-structure for one level, plus their sums.
///
/// `map` and `cs_map` each take `width × height` floats. The sums are taken
/// from the finished maps rather than accumulated inside the combine loop:
/// [`sum`] groups lanes exactly the way the combine did, so the totals are the
/// same floats, and dropping the two horizontal reductions from the inner loop
/// is worth more than the extra read costs.
#[allow(clippy::too_many_arguments)]
pub(crate) fn scale_statistics_into(
    plane1: &[f32],
    plane2: &[f32],
    width: usize,
    height: usize,
    window: &[f32],
    c1: f32,
    c2: f32,
    workspace: &mut Workspace,
    map: &mut [f32],
    cs_map: &mut [f32],
) -> (f64, f64) {
    let taps = window.len();
    let pad = taps / 2;
    debug_assert!(width > 0 && height > 0);
    debug_assert!(workspace.width >= width && workspace.taps >= taps);
    debug_assert!(map.len() >= width * height && cs_map.len() >= width * height);

    let Workspace {
        ring,
        products,
        rows,
        ..
    } = workspace;
    let products = &mut products[..3 * width];
    let rows = &mut rows[..taps];

    // Input rows already filtered into the ring. The window reaches `pad` rows
    // ahead of the output row, and reflection at either edge only ever folds
    // back into the `taps` most recent rows, so the ring never needs a row it
    // has overwritten.
    let mut filled = 0usize;
    for y in 0..height {
        let horizon = (y + pad).min(height - 1);
        while filled <= horizon {
            fill_ring_row(plane1, plane2, width, filled, taps, window, ring, products);
            filled += 1;
        }

        for (tap, row) in rows.iter_mut().enumerate() {
            let slot = reflect(y as isize + tap as isize - pad as isize, height) % taps;
            *row = slot * width;
        }

        vertical_taps_combine(
            ring,
            taps * width,
            rows,
            window,
            c1,
            c2,
            &mut map[y * width..][..width],
            &mut cs_map[y * width..][..width],
        );
    }

    let len = width * height;
    (sum(&map[..len]), sum(&cs_map[..len]))
}

/// Filter one input row of all five planes into its ring slot.
#[allow(clippy::too_many_arguments)]
fn fill_ring_row(
    plane1: &[f32],
    plane2: &[f32],
    width: usize,
    row: usize,
    taps: usize,
    window: &[f32],
    ring: &mut [f32],
    products: &mut [f32],
) {
    let first = &plane1[row * width..][..width];
    let second = &plane2[row * width..][..width];
    let (squared1, rest) = products.split_at_mut(width);
    let (squared2, cross) = rest.split_at_mut(width);
    square_and_cross(first, second, squared1, squared2, cross);

    let slot = row % taps;
    let sources: [&[f32]; PLANES] = [first, second, squared1, squared2, cross];
    for (plane, source) in sources.into_iter().enumerate() {
        let base = (plane * taps + slot) * width;
        horizontal_row_symmetric(source, &mut ring[base..base + width], window);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convolve::convolve_same_symmetric;
    use crate::gaussian::{window_1d, SIGMA};
    use crate::simd::ssim_combine_split;

    /// The unfused pipeline this module replaces, kept as the oracle.
    fn reference(
        plane1: &[f32],
        plane2: &[f32],
        width: usize,
        height: usize,
        window: &[f32],
        c1: f32,
        c2: f32,
    ) -> (Vec<f32>, Vec<f32>) {
        let len = width * height;
        let mut scratch = vec![0f32; len];
        let mut mu1 = vec![0f32; len];
        let mut mu2 = vec![0f32; len];
        convolve_same_symmetric(plane1, &mut mu1, &mut scratch, width, height, window);
        convolve_same_symmetric(plane2, &mut mu2, &mut scratch, width, height, window);

        let mut squared1 = vec![0f32; len];
        let mut squared2 = vec![0f32; len];
        let mut cross = vec![0f32; len];
        square_and_cross(plane1, plane2, &mut squared1, &mut squared2, &mut cross);

        let mut sigma1 = vec![0f32; len];
        let mut sigma2 = vec![0f32; len];
        let mut sigma12 = vec![0f32; len];
        convolve_same_symmetric(&squared1, &mut sigma1, &mut scratch, width, height, window);
        convolve_same_symmetric(&squared2, &mut sigma2, &mut scratch, width, height, window);
        convolve_same_symmetric(&cross, &mut sigma12, &mut scratch, width, height, window);

        let mut map = vec![0f32; len];
        let mut cs_map = vec![0f32; len];
        ssim_combine_split(
            &mu1,
            &mu2,
            &sigma1,
            &sigma2,
            &sigma12,
            c1,
            c2,
            &mut map,
            &mut cs_map,
        );
        (map, cs_map)
    }

    #[test]
    fn streaming_matches_the_unfused_pipeline_bit_for_bit() {
        let window = window_1d(11, SIGMA);
        for (width, height) in [(64usize, 48usize), (11, 11), (37, 13), (128, 12)] {
            let plane1: Vec<f32> = (0..width * height)
                .map(|i| ((i * 37) % 251) as f32)
                .collect();
            let plane2: Vec<f32> = (0..width * height)
                .map(|i| (((i * 53) % 241) as f32) + 0.5)
                .collect();

            let (expected_map, expected_cs) =
                reference(&plane1, &plane2, width, height, &window, 6.5025, 58.5225);

            let mut workspace = Workspace::new(width, window.len());
            let mut map = vec![0f32; width * height];
            let mut cs_map = vec![0f32; width * height];
            let (ssim_sum, cs_sum) = scale_statistics_into(
                &plane1,
                &plane2,
                width,
                height,
                &window,
                6.5025,
                58.5225,
                &mut workspace,
                &mut map,
                &mut cs_map,
            );

            assert_eq!(map, expected_map, "{width}x{height} ssim map");
            assert_eq!(cs_map, expected_cs, "{width}x{height} cs map");
            assert_eq!(ssim_sum, sum(&expected_map));
            assert_eq!(cs_sum, sum(&expected_cs));
        }
    }

    /// A workspace outlives the level it was built for, so the smaller levels
    /// have to be correct while re-slicing oversized buffers.
    #[test]
    fn a_workspace_sized_for_a_larger_level_still_matches() {
        let window = window_1d(11, SIGMA);
        let (width, height) = (24usize, 19usize);
        let plane1: Vec<f32> = (0..width * height).map(|i| (i % 97) as f32).collect();
        let plane2: Vec<f32> = (0..width * height).map(|i| ((i * 3) % 89) as f32).collect();
        let (expected_map, _) = reference(&plane1, &plane2, width, height, &window, 6.5, 58.5);

        let mut workspace = Workspace::new(256, window.len());
        let mut map = vec![0f32; 256 * 256];
        let mut cs_map = vec![0f32; 256 * 256];
        scale_statistics_into(
            &plane1,
            &plane2,
            width,
            height,
            &window,
            6.5,
            58.5,
            &mut workspace,
            &mut map,
            &mut cs_map,
        );
        assert_eq!(&map[..width * height], &expected_map[..]);
    }
}
