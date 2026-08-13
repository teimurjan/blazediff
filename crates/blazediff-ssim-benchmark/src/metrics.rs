//! The metrics under test, behind one uniform "score a decoded pair" call.
//!
//! The uniform signature is a convenience for the harness, not a claim that the
//! metrics are equivalent — dssim works in linear-light Lab across weighted
//! scales, the stock blazediff family works on gamma-encoded luma. See the crate
//! README for what that difference does and does not license.

use blazediff::Image;
use blazediff_ssim::{
    hitchhikers_ssim, ms_ssim, perceptual_ssim, ssim, ColorSpace, HitchhikersOptions,
    MsSsimOptions, PerceptualOptions, Plane, Pooling, Rgba8, SsimOptions,
};
use rgb::FromSlice;

/// Which end of a metric's range means "identical".
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Polarity {
    /// Higher is more alike (the blazediff family).
    Similarity,
    /// Higher is more different (dssim).
    Dissimilarity,
}

/// One scorer the harness can run, with the metadata needed to put it on a
/// common axis with the others.
pub struct Contender {
    pub name: String,
    pub polarity: Polarity,
    /// Shortest edge the metric can handle.
    min_side: u32,
    scorer: Box<dyn Fn(&Image, &Image) -> f64 + Send + Sync>,
}

impl Contender {
    pub fn score(&self, image1: &Image, image2: &Image) -> f64 {
        (self.scorer)(image1, image2)
    }

    pub fn supports(&self, width: u32, height: u32) -> bool {
        width.min(height) >= self.min_side
    }

    /// Rewrite a score as "how different", so metrics on opposite polarities
    /// can be ranked against each other.
    pub fn as_distance(&self, score: f64) -> f64 {
        match self.polarity {
            Polarity::Similarity => -score,
            Polarity::Dissimilarity => score,
        }
    }

    /// Rewrite a score as "predicted quality", so every metric runs the same
    /// way as a mean opinion score: higher is better.
    pub fn as_quality(&self, score: f64) -> f64 {
        -self.as_distance(score)
    }

    pub fn is_dssim(&self) -> bool {
        self.polarity == Polarity::Dissimilarity
    }
}

/// Which shipped metric a contender runs.
#[derive(Clone, Copy)]
enum Stock {
    Ssim,
    MsSsim,
    Hitchhikers,
}

/// A stock `blazediff-ssim` metric, called directly — `blazediff` is a pixel
/// diff and knows nothing about this family.
fn stock(name: &str, metric: Stock, min_side: u32) -> Contender {
    Contender {
        name: name.to_string(),
        polarity: Polarity::Similarity,
        min_side,
        scorer: Box::new(move |image1, image2| {
            let shared = SsimOptions::default();
            let plane = |image: &Image| Plane::from_rgba8(view(image)).expect("plane");
            let (plane1, plane2) = (plane(image1), plane(image2));
            let outcome = match metric {
                Stock::Ssim => ssim(&plane1, &plane2, &shared),
                Stock::MsSsim => ms_ssim(&plane1, &plane2, &shared, &MsSsimOptions::default()),
                Stock::Hitchhikers => {
                    hitchhikers_ssim(&plane1, &plane2, &shared, &HitchhikersOptions::default())
                }
            };
            outcome.expect("blazediff-ssim metric").score
        }),
    }
}

/// Borrow an [`Image`] in the shape `blazediff-ssim` takes.
fn view(image: &Image) -> Rgba8<'_> {
    Rgba8::new(&image.data, image.width as usize, image.height as usize)
}

/// A configuration of the tunable perceptual variant.
fn perceptual(name: &str, options: PerceptualOptions) -> Contender {
    let min_side = (11usize << (options.weights.len() - 1)) as u32;
    Contender {
        name: name.to_string(),
        polarity: Polarity::Similarity,
        min_side,
        scorer: Box::new(move |image1, image2| {
            perceptual_ssim(
                view(image1),
                view(image2),
                &SsimOptions::default(),
                &options,
            )
            .expect("perceptual ssim")
            .score
        }),
    }
}

fn dssim_contender() -> Contender {
    Contender {
        name: "dssim".to_string(),
        polarity: Polarity::Dissimilarity,
        min_side: 8,
        scorer: Box::new(|image1, image2| {
            let attr = dssim_core::Dssim::new();
            let (width, height) = (image1.width as usize, image1.height as usize);
            let load = |image: &Image| {
                attr.create_image_rgba(image.data.as_rgba(), width, height)
                    .expect("dssim image")
            };
            let (original, modified) = (load(image1), load(image2));
            f64::from(attr.compare(&original, &modified).0)
        }),
    }
}

/// The shipped metrics plus dssim — what the speed benchmark times and what
/// Phase 1 scored against human opinion.
pub fn baseline() -> Vec<Contender> {
    vec![
        stock("ssim", Stock::Ssim, 11),
        stock("ms-ssim", Stock::MsSsim, 11 * 16),
        stock("hitchhikers", Stock::Hitchhikers, 11),
        dssim_contender(),
    ]
}

/// One knob at a time, on top of the `ms-ssim` baseline, so each departure's
/// contribution is separable rather than tangled into a single "new metric".
///
/// `ms-ssim` and `perceptual/base` must score identically — the latter is the
/// tunable implementation with every knob off, and any gap between them is a
/// bug rather than a finding.
pub fn ablation() -> Vec<Contender> {
    let lab = |chroma_weight: f64, chroma_subsample: u32, pooling: Pooling| PerceptualOptions {
        color: ColorSpace::Lab,
        chroma_weight,
        chroma_subsample,
        pooling,
        ..Default::default()
    };

    vec![
        stock("ms-ssim", Stock::MsSsim, 11 * 16),
        perceptual("perceptual/base", PerceptualOptions::default()),
        perceptual(
            "+mad",
            PerceptualOptions {
                pooling: Pooling::MeanAbsoluteDeviation,
                ..Default::default()
            },
        ),
        perceptual("+lab", lab(0.0, 0, Pooling::Mean)),
        perceptual("+lab+chroma.10", lab(0.10, 0, Pooling::Mean)),
        perceptual("+lab+chroma.25", lab(0.25, 0, Pooling::Mean)),
        perceptual("+lab+chroma.50", lab(0.50, 0, Pooling::Mean)),
        perceptual("+lab+chroma.25/sub1", lab(0.25, 1, Pooling::Mean)),
        perceptual(
            "+lab+chroma.25+mad",
            lab(0.25, 0, Pooling::MeanAbsoluteDeviation),
        ),
        perceptual(
            "+lab+chroma.25/sub1+mad",
            lab(0.25, 1, Pooling::MeanAbsoluteDeviation),
        ),
        dssim_contender(),
    ]
}

/// Whether dssim was built with its `threads` feature, for the run header.
pub const DSSIM_THREADED: bool = cfg!(feature = "dssim-threads");

#[cfg(test)]
mod tests {
    use super::*;

    fn gradient(width: u32, height: u32, shift: u8) -> Image {
        let mut image = Image::new(width, height);
        for (i, pixel) in image.data.chunks_exact_mut(4).enumerate() {
            let value = ((i % 251) as u8).wrapping_add(shift);
            pixel.copy_from_slice(&[value, value / 2, value / 3, 255]);
        }
        image
    }

    /// Heavy posterisation: still positively correlated with `gradient`, so
    /// it degrades the image without the global anticorrelation that makes
    /// MS-SSIM's product pooling degenerate.
    fn posterised(width: u32, height: u32, step: u8) -> Image {
        let mut image = Image::new(width, height);
        for (i, pixel) in image.data.chunks_exact_mut(4).enumerate() {
            let value = (i % 251) as u8 / step * step;
            pixel.copy_from_slice(&[value, value / 2, value / 3, 255]);
        }
        image
    }

    #[test]
    fn every_metric_reports_a_perfect_match_on_identical_input() {
        let image = gradient(256, 256, 0);
        for contender in baseline().iter().chain(ablation().iter()) {
            let value = contender.score(&image, &image);
            let expected = if contender.is_dssim() { 0.0 } else { 1.0 };
            assert!(
                (value - expected).abs() < 1e-9,
                "{} scored {value}, expected {expected}",
                contender.name
            );
        }
    }

    #[test]
    fn distances_agree_on_which_pair_is_worse() {
        let base = gradient(256, 256, 0);
        let near = gradient(256, 256, 2);
        let far = posterised(256, 256, 96);

        for contender in baseline() {
            let close = contender.as_distance(contender.score(&base, &near));
            let distant = contender.as_distance(contender.score(&base, &far));
            assert!(
                close < distant,
                "{} ranked {close} >= {distant}",
                contender.name
            );
        }
    }

    /// The ablation is only interpretable if its zero point matches the metric
    /// it claims to extend.
    #[test]
    fn the_ablation_baseline_matches_ms_ssim_exactly() {
        let base = gradient(256, 256, 0);
        let other = gradient(256, 256, 7);
        let set = ablation();
        let ms_ssim = set.iter().find(|c| c.name == "ms-ssim").unwrap();
        let zero_knobs = set.iter().find(|c| c.name == "perceptual/base").unwrap();
        assert_eq!(
            ms_ssim.score(&base, &other),
            zero_knobs.score(&base, &other)
        );
    }

    /// Characterisation test, not an aspiration: the stock blazediff metrics
    /// reduce to luma, so a change carried entirely by chroma is invisible to
    /// them. dssim compares Lab's a/b channels and sees it.
    #[test]
    fn the_stock_metrics_are_blind_to_a_pure_chroma_change() {
        const EQUAL_LUMA: [[u8; 3]; 2] = [[200, 30, 60], [111, 39, 247]];
        let board = |swapped: bool| {
            let mut image = Image::new(256, 256);
            for (i, pixel) in image.data.chunks_exact_mut(4).enumerate() {
                let (x, y) = (i as u32 % 256, i as u32 / 256);
                let square = ((x / 8 + y / 8) % 2) as usize;
                let colour = EQUAL_LUMA[if swapped { 1 - square } else { square }];
                pixel.copy_from_slice(&[colour[0], colour[1], colour[2], 255]);
            }
            image
        };
        let (image1, image2) = (board(false), board(true));

        for contender in baseline() {
            let value = contender.score(&image1, &image2);
            if contender.is_dssim() {
                assert!(
                    value > 0.01,
                    "dssim should see the colour swap, got {value}"
                );
            } else {
                // The two lumas agree to ~1e-5 rather than bit-exactly, and an
                // `f32` SSIM pipeline drifts a hair past 1.0 on a flat field.
                assert!(
                    (value - 1.0).abs() < 1e-4,
                    "{} should be blind to it, got {value}",
                    contender.name
                );
            }
        }
    }

    #[test]
    fn ms_ssim_needs_five_octaves_of_headroom() {
        let set = baseline();
        let ms_ssim = set.iter().find(|c| c.name == "ms-ssim").unwrap();
        let ssim = set.iter().find(|c| c.name == "ssim").unwrap();
        assert!(!ms_ssim.supports(128, 128));
        assert!(ms_ssim.supports(176, 176));
        assert!(ssim.supports(16, 16));
    }
}
