//! An MS-SSIM variant with the departures from textbook SSIM turned into knobs.
//!
//! Phase-1 measurement (`crates/blazediff-ssim-benchmark`, KADID-10k) said
//! dssim predicts human opinion better than `ms-ssim` by 0.037 SRCC, and that
//! going single- to multi-scale was worth 0.069 on its own. This module exists
//! to find out which of dssim's *remaining* departures are worth what — so each
//! is independently switchable and the harness can ablate them rather than
//! anyone guessing.
//!
//! With [`PerceptualOptions::default`] every knob is off and this reduces to
//! `super::ms_ssim`, which `reduces_to_ms_ssim_with_every_knob_off` pins.

use super::color::{linear_rgb_to_lab_into, to_linear_rgb, LinearRgb};
use super::convolve::halve_into;
use super::gaussian::{window_1d, SIGMA};
use super::multiscale::{MsSsimMethod, DEFAULT_WEIGHTS};
use super::simd::sum_absolute_deviation;
use super::stats::{scale_statistics_into, Workspace};
use super::{SsimOptions, SsimOutcome};
use crate::{Rgba8, SsimError};

/// Which space the pyramid scales in and the statistics are computed in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ColorSpace {
    /// MATLAB's `rgb2gray` over gamma-encoded sRGB. What `ms-ssim` does.
    #[default]
    GammaLuma,
    /// Downscale in linear light, compare in CIE L\*a\*b\*.
    Lab,
}

/// How a scale's local map collapses to one number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Pooling {
    /// Plain mean. What every blazediff metric except Hitchhiker's does.
    #[default]
    Mean,
    /// `mean − λ·MAD`: penalise a map whose damage is concentrated, which a
    /// mean smears away. dssim pools by mean absolute deviation.
    MeanAbsoluteDeviation,
}

#[derive(Clone, Debug)]
pub struct PerceptualOptions {
    pub weights: Vec<f64>,
    pub method: MsSsimMethod,
    pub color: ColorSpace,
    /// Weight on each chroma channel relative to lightness. `0.0` ignores
    /// chroma entirely; only meaningful under [`ColorSpace::Lab`].
    pub chroma_weight: f64,
    /// Extra octaves of downscaling applied to a\*/b\* before their statistics,
    /// modelling the eye's lower chroma acuity. `0` compares them at full
    /// resolution.
    pub chroma_subsample: u32,
    pub pooling: Pooling,
    /// λ in the MAD pooling above.
    pub deviation_weight: f64,
}

impl Default for PerceptualOptions {
    fn default() -> Self {
        Self {
            weights: DEFAULT_WEIGHTS.to_vec(),
            method: MsSsimMethod::default(),
            color: ColorSpace::default(),
            chroma_weight: 0.0,
            chroma_subsample: 0,
            pooling: Pooling::default(),
            deviation_weight: 1.0,
        }
    }
}

/// Pooled perceptual SSIM over an RGBA pair.
///
/// Takes [`Rgba8`] rather than [`crate::Plane`] because, unlike the rest of the
/// family, this one can look at colour.
pub fn perceptual_ssim(
    image1: Rgba8<'_>,
    image2: Rgba8<'_>,
    options: &SsimOptions,
    perceptual: &PerceptualOptions,
) -> Result<SsimOutcome, SsimError> {
    let scales = perceptual.weights.len();
    if scales == 0 {
        return Err(SsimError::Options(
            "perceptual ssim needs at least one scale weight".to_string(),
        ));
    }

    if image1.width != image2.width || image1.height != image2.height {
        return Err(SsimError::SizeMismatch {
            img1_width: image1.width as u32,
            img1_height: image1.height as u32,
            img2_width: image2.width as u32,
            img2_height: image2.height as u32,
        });
    }
    image1.validate()?;
    image2.validate()?;

    let (width, height) = (image1.width, image1.height);
    let window_size = options.window_size;
    if width.min(height) >> (scales - 1) < window_size {
        return Err(SsimError::InputTooSmall {
            width: width as u32,
            height: height as u32,
            minimum: (window_size << (scales - 1)) as u32,
        });
    }

    let window = window_1d(window_size, SIGMA);
    let dynamic_range = options.dynamic_range();
    let c1 = (options.k1 * dynamic_range).powi(2) as f32;
    let c2 = (options.k2 * dynamic_range).powi(2) as f32;

    // Everything the pyramid writes to is allocated once, at the finest level's
    // size, and re-sliced on the way down. Five scales times three channels is
    // fifteen sets of full-size intermediates otherwise, and faulting those in
    // costs more than the arithmetic they carry.
    let full = width * height;
    let mut pyramid = Pyramid::new(image1, image2, perceptual.color);
    let mut workspace = Workspace::new(width, window_size);
    let mut map = vec![0f32; full];
    let mut cs_map = vec![0f32; full];
    let mut chroma1 = Halver::new(perceptual.chroma_subsample > 0, full);
    let mut chroma2 = Halver::new(perceptual.chroma_subsample > 0, full);

    let mut ssim_per_scale = Vec::with_capacity(scales);
    let mut cs_per_scale = Vec::with_capacity(scales);
    let mut coarsest = (Vec::new(), 0usize, 0usize);

    for scale in 0..scales {
        let (width, height) = pyramid.size();

        // Lightness always carries weight 1; each chroma channel carries
        // `chroma_weight`, so the combination stays a weighted average.
        let mut ssim_total = 0.0;
        let mut cs_total = 0.0;
        let mut weight_total = 0.0;
        let mut lightness_map = Vec::new();

        for index in 0..pyramid.channel_count() {
            let is_chroma = index > 0;
            let weight = if is_chroma {
                perceptual.chroma_weight
            } else {
                1.0
            };
            if weight == 0.0 {
                continue;
            }

            // Read the pyramid's own planes unless the chroma pair actually has
            // to shrink — the statistics only read them, so handing the level's
            // plane straight through costs nothing, and only the shrunk pair
            // needs somewhere to live.
            let (source1, source2) = pyramid.channel(index);
            let (plane1, plane2, plane_width, plane_height) =
                if is_chroma && perceptual.chroma_subsample > 0 {
                    let octaves = perceptual.chroma_subsample;
                    let (w, h) = chroma1.halve(source1, width, height, octaves);
                    chroma2.halve(source2, width, height, octaves);
                    (chroma1.plane(source1), chroma2.plane(source2), w, h)
                } else {
                    (source1, source2, width, height)
                };
            // A chroma plane can shrink below the window; skip it rather than
            // fail the whole comparison.
            if plane_width < window_size || plane_height < window_size {
                continue;
            }

            let len = plane_width * plane_height;
            let (ssim_sum, cs_sum) = scale_statistics_into(
                plane1,
                plane2,
                plane_width,
                plane_height,
                &window,
                c1,
                c2,
                &mut workspace,
                &mut map,
                &mut cs_map,
            );
            ssim_total += weight * pool(&map[..len], ssim_sum, perceptual);
            cs_total += weight * pool(&cs_map[..len], cs_sum, perceptual);
            weight_total += weight;

            // The chroma channels overwrite the shared map, so the coarsest
            // lightness map — the one the caller renders — is taken here.
            if !is_chroma && scale == scales - 1 {
                lightness_map = map[..len].to_vec();
            }
        }

        if weight_total == 0.0 {
            return Err(SsimError::Options(
                "every channel was skipped; check chroma_weight and chroma_subsample".to_string(),
            ));
        }
        ssim_per_scale.push(ssim_total / weight_total);
        cs_per_scale.push(cs_total / weight_total);

        if scale == scales - 1 {
            coarsest = (lightness_map, width, height);
            break;
        }
        pyramid.descend();
    }

    let last = scales - 1;
    let coarse_to_fine = cs_per_scale[..last].iter().zip(&perceptual.weights[..last]);
    let score = match perceptual.method {
        MsSsimMethod::Product => {
            let product = coarse_to_fine.fold(1.0, |acc, (cs, weight)| acc * cs.powf(*weight));
            product * ssim_per_scale[last].powf(perceptual.weights[last])
        }
        MsSsimMethod::WeightedSum => {
            let total: f64 = perceptual.weights.iter().sum();
            let sum = coarse_to_fine
                .map(|(cs, weight)| cs * (weight / total))
                .sum::<f64>();
            sum + ssim_per_scale[last] * (perceptual.weights[last] / total)
        }
    };

    Ok(SsimOutcome {
        score,
        map: coarsest.0,
        map_width: coarsest.1,
        map_height: coarsest.2,
    })
}

/// Collapse one scale's map to a number.
fn pool(map: &[f32], sum: f64, options: &PerceptualOptions) -> f64 {
    let count = map.len() as f64;
    let mean = sum / count;
    match options.pooling {
        Pooling::Mean => mean,
        Pooling::MeanAbsoluteDeviation => {
            let deviation = sum_absolute_deviation(map, mean) / count;
            mean - options.deviation_weight * deviation
        }
    }
}

/// Ping-pong scratch for dropping one chroma plane by whole octaves.
///
/// Both buffers are sized for a quarter of the finest level, which covers every
/// octave of every level, so a subsampled configuration allocates twice for the
/// whole comparison rather than twice per channel per scale.
struct Halver {
    buffers: [Vec<f32>; 2],
    halved: bool,
}

impl Halver {
    fn new(needed: bool, full: usize) -> Self {
        let capacity = if needed { full / 4 + 1 } else { 0 };
        Self {
            buffers: [vec![0f32; capacity], vec![0f32; capacity]],
            halved: false,
        }
    }

    /// Halve `plane` up to `octaves` times, stopping early if it would run out
    /// of samples. Returns the size that came out.
    fn halve(
        &mut self,
        plane: &[f32],
        width: usize,
        height: usize,
        octaves: u32,
    ) -> (usize, usize) {
        let (front, back) = self.buffers.split_at_mut(1);
        let (front, back) = (&mut front[0], &mut back[0]);
        let (mut width, mut height) = (width, height);
        self.halved = false;
        for _ in 0..octaves {
            if width < 2 || height < 2 {
                break;
            }
            let (next_width, next_height) = if self.halved {
                let size = halve_into(front, width, height, back);
                std::mem::swap(front, back);
                size
            } else {
                halve_into(plane, width, height, front)
            };
            self.halved = true;
            width = next_width;
            height = next_height;
        }
        (width, height)
    }

    /// The halved plane, or `original` where nothing was halved.
    fn plane<'a>(&'a self, original: &'a [f32]) -> &'a [f32] {
        if self.halved {
            &self.buffers[0]
        } else {
            original
        }
    }
}

/// The scale pyramid, holding whatever representation `ColorSpace` calls for.
///
/// Under [`ColorSpace::Lab`] the *linear-light RGB* planes are what descend;
/// L\*a\*b\* is derived fresh at each level. Downscaling the L\*a\*b\* planes
/// directly would average in a perceptual space, which is precisely the gamma
/// error the linear-light step exists to avoid.
///
/// Every plane is allocated once at the finest level's size and only the first
/// `width × height` samples are live at deeper levels.
struct Pyramid {
    source: Source,
    /// Channel planes for the current level, lightness first. Derived once per
    /// level rather than per channel read.
    first: Vec<Vec<f32>>,
    second: Vec<Vec<f32>>,
    width: usize,
    height: usize,
}

enum Source {
    GammaLuma {
        spare: (Vec<f32>, Vec<f32>),
    },
    /// Boxed only because it is six times the other variant's size, and this
    /// enum is one local per comparison — one indirection next to buffers
    /// measured in megabytes.
    Lab(Box<LinearPyramid>),
}

/// The linear-light planes a [`ColorSpace::Lab`] pyramid descends, and the
/// spares the halved level lands in before the two swap.
struct LinearPyramid {
    first: LinearRgb,
    second: LinearRgb,
    spare: (LinearRgb, LinearRgb),
}

impl Pyramid {
    /// Both views are already validated by [`perceptual_ssim`], so the slicing
    /// below cannot go out of bounds and this stays infallible.
    fn new(image1: Rgba8<'_>, image2: Rgba8<'_>, color: ColorSpace) -> Self {
        let (width, height) = (image1.width, image1.height);
        let full = width * height;
        let quarter = full / 4 + 1;
        let (source, first, second) = match color {
            ColorSpace::GammaLuma => (
                Source::GammaLuma {
                    spare: (vec![0f32; quarter], vec![0f32; quarter]),
                },
                vec![crate::grayscale::to_luma(&image1.data[..full * 4])],
                vec![crate::grayscale::to_luma(&image2.data[..full * 4])],
            ),
            ColorSpace::Lab => {
                let linear1 = to_linear_rgb(&image1.data[..full * 4]);
                let linear2 = to_linear_rgb(&image2.data[..full * 4]);
                let mut first = vec![vec![0f32; full], vec![0f32; full], vec![0f32; full]];
                let mut second = vec![vec![0f32; full], vec![0f32; full], vec![0f32; full]];
                write_lab(&linear1, full, &mut first);
                write_lab(&linear2, full, &mut second);
                (
                    Source::Lab(Box::new(LinearPyramid {
                        first: linear1,
                        second: linear2,
                        spare: (LinearRgb::zeroed(quarter), LinearRgb::zeroed(quarter)),
                    })),
                    first,
                    second,
                )
            }
        };
        Self {
            source,
            first,
            second,
            width,
            height,
        }
    }

    fn size(&self) -> (usize, usize) {
        (self.width, self.height)
    }

    fn channel_count(&self) -> usize {
        self.first.len()
    }

    /// `(plane1, plane2)` for one channel, cropped to the current level.
    fn channel(&self, index: usize) -> (&[f32], &[f32]) {
        let len = self.width * self.height;
        (&self.first[index][..len], &self.second[index][..len])
    }

    fn descend(&mut self) {
        let (width, height) = (self.width, self.height);
        match &mut self.source {
            Source::GammaLuma { spare } => {
                let (next_width, next_height) =
                    halve_into(&self.first[0], width, height, &mut spare.0);
                halve_into(&self.second[0], width, height, &mut spare.1);
                std::mem::swap(&mut self.first[0], &mut spare.0);
                std::mem::swap(&mut self.second[0], &mut spare.1);
                self.width = next_width;
                self.height = next_height;
            }
            Source::Lab(linear) => {
                let LinearPyramid {
                    first,
                    second,
                    spare,
                } = &mut **linear;
                let (next_width, next_height) = first.halve_into(width, height, &mut spare.0);
                second.halve_into(width, height, &mut spare.1);
                std::mem::swap(first, &mut spare.0);
                std::mem::swap(second, &mut spare.1);
                self.width = next_width;
                self.height = next_height;

                let len = next_width * next_height;
                write_lab(first, len, &mut self.first);
                write_lab(second, len, &mut self.second);
            }
        }
    }
}

/// L\*a\*b\* planes for one side of a level, lightness first.
fn write_lab(linear: &LinearRgb, len: usize, channels: &mut [Vec<f32>]) {
    let (lightness, rest) = channels.split_at_mut(1);
    let (green_red, blue_yellow) = rest.split_at_mut(1);
    linear_rgb_to_lab_into(
        linear,
        len,
        &mut lightness[0],
        &mut green_red[0],
        &mut blue_yellow[0],
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ms_ssim, MsSsimOptions, Plane};

    const SIDE: usize = 256;

    fn image(width: usize, height: usize, f: impl Fn(usize, usize) -> [u8; 3]) -> Vec<u8> {
        let mut data = vec![0u8; width * height * 4];
        for (i, pixel) in data.chunks_exact_mut(4).enumerate() {
            let rgb = f(i % width, i / width);
            pixel.copy_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
        data
    }

    /// A square view over a buffer `image`/`textured` produced.
    fn view(data: &[u8]) -> Rgba8<'_> {
        Rgba8::new(data, SIDE, SIDE)
    }

    fn textured(shift: u8) -> Vec<u8> {
        image(SIDE, SIDE, |x, y| {
            let v = ((x * 7 + y * 13) % 251) as u8;
            [
                v.wrapping_add(shift),
                (v / 2).wrapping_add(shift),
                (v / 3).wrapping_add(shift),
            ]
        })
    }

    /// The contract that makes the ablation meaningful: with no knob turned on,
    /// this is exactly MS-SSIM, so any measured delta is attributable to a knob
    /// rather than to a reimplementation drifting.
    #[test]
    fn reduces_to_ms_ssim_with_every_knob_off() {
        let image1 = textured(0);
        let image2 = textured(9);
        let options = SsimOptions::default();

        let baseline = ms_ssim(
            &Plane::from_rgba8(view(&image1)).unwrap(),
            &Plane::from_rgba8(view(&image2)).unwrap(),
            &options,
            &MsSsimOptions::default(),
        )
        .unwrap()
        .score;
        let ours = perceptual_ssim(
            view(&image1),
            view(&image2),
            &options,
            &PerceptualOptions::default(),
        )
        .unwrap()
        .score;

        assert_eq!(ours, baseline, "default must be bit-identical to ms-ssim");
    }

    #[test]
    fn identical_images_score_one_in_every_configuration() {
        let image1 = textured(0);
        for color in [ColorSpace::GammaLuma, ColorSpace::Lab] {
            for pooling in [Pooling::Mean, Pooling::MeanAbsoluteDeviation] {
                let perceptual = PerceptualOptions {
                    color,
                    pooling,
                    chroma_weight: if color == ColorSpace::Lab { 0.5 } else { 0.0 },
                    ..Default::default()
                };
                let score = perceptual_ssim(
                    view(&image1),
                    view(&image1),
                    &SsimOptions::default(),
                    &perceptual,
                )
                .unwrap()
                .score;
                assert!(
                    (score - 1.0).abs() < 1e-9,
                    "{color:?}/{pooling:?} scored {score}"
                );
            }
        }
    }

    /// The equal-luma blind spot, taken apart knob by knob.
    ///
    /// The two colours match under `rgb2gray`'s weights applied to
    /// *gamma-encoded* channels. They do not match in linear-light Y, and
    /// therefore not in L\* either — so moving to Lab recovers most of the blind
    /// spot before a single chroma channel is switched on. Chroma then closes
    /// the rest. Both effects are real and this pins their order.
    #[test]
    fn chroma_weight_opens_the_equal_luma_blind_spot() {
        const EQUAL_LUMA: [[u8; 3]; 2] = [[200, 30, 60], [111, 39, 247]];
        let board = |swapped: bool| {
            image(SIDE, SIDE, |x, y| {
                let square = (x / 8 + y / 8) % 2;
                EQUAL_LUMA[if swapped { 1 - square } else { square }]
            })
        };
        let (image1, image2) = (board(false), board(true));
        let options = SsimOptions::default();
        let score = |perceptual: PerceptualOptions| {
            perceptual_ssim(view(&image1), view(&image2), &options, &perceptual)
                .unwrap()
                .score
        };

        let gamma_luma = score(PerceptualOptions::default());
        let lab_lightness = score(PerceptualOptions {
            color: ColorSpace::Lab,
            chroma_weight: 0.0,
            ..Default::default()
        });
        let lab_chroma = score(PerceptualOptions {
            color: ColorSpace::Lab,
            chroma_weight: 1.0,
            ..Default::default()
        });

        assert!(
            gamma_luma > 0.99,
            "gamma luma is blind by construction, got {gamma_luma}"
        );
        assert!(
            lab_lightness < 0.8,
            "linear-light L* alone should already see most of it, got {lab_lightness}"
        );
        assert!(
            lab_chroma < lab_lightness,
            "chroma should sharpen it further: {lab_chroma} vs {lab_lightness}"
        );
    }

    #[test]
    fn deviation_pooling_never_scores_above_the_mean() {
        let image1 = textured(0);
        let image2 = textured(20);
        let options = SsimOptions::default();
        let with = |pooling| {
            perceptual_ssim(
                view(&image1),
                view(&image2),
                &options,
                &PerceptualOptions {
                    pooling,
                    ..Default::default()
                },
            )
            .unwrap()
            .score
        };
        assert!(with(Pooling::MeanAbsoluteDeviation) <= with(Pooling::Mean));
    }

    #[test]
    fn chroma_subsampling_shrinks_the_colour_planes_without_failing() {
        let image1 = textured(0);
        let image2 = textured(12);
        let score = perceptual_ssim(
            view(&image1),
            view(&image2),
            &SsimOptions::default(),
            &PerceptualOptions {
                color: ColorSpace::Lab,
                chroma_weight: 0.5,
                chroma_subsample: 2,
                ..Default::default()
            },
        )
        .unwrap()
        .score;
        assert!(score.is_finite() && score < 1.0, "got {score}");
    }
}
