//! Structured region analysis: given two images and a set of changed regions,
//! describe what changed in each one.
//!
//! The classifier is deliberately separate from whatever *found* the regions.
//! `blazediff` finds them by connected components over a pixel-diff mask,
//! `blazediff-ssim` can find them by thresholding a score map, and a caller can
//! simply supply them — DOM rectangles, a JS-side diff, anything. All three get
//! identical per-pixel classification, because a coarse region is refined
//! against the source pixels before any statistic is computed.
//!
//! ```
//! use blazediff_interpret::{interpret, types::BoundingBox, ChangeSource};
//! # use blazediff_shared::Image;
//! # let (a, b) = (Image::new(64, 64), Image::new(64, 64));
//! let result = interpret(&a, &b, ChangeSource::Regions(&[BoundingBox { x: 8, y: 8, width: 16, height: 16 }]))?;
//! println!("{}", result.summary);
//! # Ok::<(), blazediff_interpret::InterpretError>(())
//! ```

mod chroma;
mod color_delta;
mod content_analysis;
mod gradient;
mod interpretation;
#[cfg(feature = "napi")]
mod napi;
mod region;
mod severity;
mod shape;
mod shifts;
mod spatial;
mod summary;
// Small image constructors shared by this crate's tests and by `blazediff`'s
// end-to-end interpret tests, which live there because they need `diff`.
#[cfg(any(test, feature = "testing"))]
#[doc(hidden)]
pub mod test_helpers;
pub mod types;

use blazediff::{DiffOptions, DiffResult};
use blazediff_shared::yiq::color_delta;
use blazediff_shared::Image;
use blazediff_ssim::SsimOutcome;
use chroma::compute_chroma_stats;
use color_delta::compute_color_delta;
use content_analysis::analyze_content;
use gradient::{compute_gradient_stats, compute_luminance_ncc};
use interpretation::classify_change_type;
use shape::{classify_shape, compute_shape_stats};

use spatial::classify_position;
use types::ChangeType;

/// YIQ squared-delta floor for treating a pixel as actually changed.
/// 100.0 corresponds to a YIQ-weighted distance of 10, roughly equivalent to
/// a perceptual delta of ~0.017 — filters near-identical pixels without
/// throwing away genuine edits.
pub use region::{
    detect_regions, extract_change_mask, merge_overlapping_components, ChangeDensity, ComponentInfo,
};
pub use severity::classify_severity;
// Exposed for producers that already hold an exact per-pixel mask and so must
// not go through `classify_regions`, which refines a coarse one.
pub use shifts::detect_shifts;
pub use summary::build_summary;
pub use types::{BoundingBox, ChangeRegion, ChangeSeverity, InterpretResult};

/// Why a set of regions could not be interpreted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InterpretError {
    /// The two images are not the same size, so one mask cannot describe both.
    SizeMismatch {
        img1_width: u32,
        img1_height: u32,
        img2_width: u32,
        img2_height: u32,
    },
    /// A supplied region falls outside the image. Regions arrive from callers
    /// now — including across the wasm and N-API boundaries — so this is a
    /// rejection rather than an out-of-bounds panic.
    RegionOutOfBounds {
        bbox: BoundingBox,
        width: u32,
        height: u32,
    },
    /// The diff or metric this was asked to interpret failed first.
    Producer(String),
}

impl std::fmt::Display for InterpretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InterpretError::SizeMismatch {
                img1_width,
                img1_height,
                img2_width,
                img2_height,
            } => write!(
                f,
                "Image sizes do not match: {}x{} vs {}x{}",
                img1_width, img1_height, img2_width, img2_height
            ),
            InterpretError::RegionOutOfBounds {
                bbox,
                width,
                height,
            } => write!(
                f,
                "Region {}x{} at ({}, {}) falls outside the {}x{} image",
                bbox.width, bbox.height, bbox.x, bbox.y, width, height
            ),
            InterpretError::Producer(e) => write!(f, "{}", e),
        }
    }
}

impl std::error::Error for InterpretError {}

const REFINE_DELTA_FLOOR_SQ: f32 = 100.0;

/// Components below this size never survive detection: single-digit-pixel
/// specks are compression jitter at any image scale.
const SPECK_FLOOR: u32 = 8;
/// Component size that counts as a "speck" for the noise census.
const NOISE_CENSUS_PIXELS: u32 = 64;
/// Pixels of noise floor added per censused speck. A pair with hundreds of
/// speck components (a recompressed photo) raises its own floor into the
/// hundreds of pixels; a clean render keeps the minimum.
const NOISE_FLOOR_PER_SPECK: f64 = 3.0;
/// Noise floor for perfectly clean pairs.
const NOISE_FLOOR_MIN: u32 = 12;
/// Bbox-merge slack: components this close are one change. Horizontal slack
/// is wider than vertical because text fragments on a line sit further apart
/// than the strokes within them.
const MERGE_SLACK_X: u32 = 12;
const MERGE_SLACK_Y: u32 = 8;
/// Reported-bbox margin: one third of the region dimension, clamped.
const MARGIN_DIVISOR: u32 = 3;
const MARGIN_MIN: u32 = 2;
const MARGIN_MAX: u32 = 12;

/// Refine a coarse mask down to the actually-changed pixels inside the given
/// bboxes. Pixels marked true in `input_mask` but with a tiny YIQ delta between
/// `img1` and `img2` are dropped. Used by classifier-only paths so callers can
/// pass a bbox-filled mask without polluting statistics with unchanged content.
fn refine_change_mask_in_bboxes(
    img1: &Image,
    img2: &Image,
    input_mask: &[bool],
    bboxes: &[types::BoundingBox],
    width: u32,
) -> Vec<bool> {
    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();
    let mut refined = input_mask.to_vec();
    for bbox in bboxes {
        let mut survivors = 0u32;
        let mut any_delta = false;
        for y in bbox.y..bbox.y + bbox.height {
            for x in bbox.x..bbox.x + bbox.width {
                let idx = (y * width + x) as usize;
                if !refined[idx] {
                    continue;
                }
                let delta = color_delta(pixels1[idx], pixels2[idx], idx).abs() as f32;
                if delta < REFINE_DELTA_FLOOR_SQ {
                    refined[idx] = false;
                    any_delta |= delta > 0.0;
                } else {
                    survivors += 1;
                }
            }
        }
        // A caller claimed a change here and the pixels do differ, just all
        // below the floor (a sub-threshold edit, e.g. a subtle uniform
        // recolor). Refining to nothing would erase the region and zero out
        // every statistic, so keep the caller's mask for this bbox. Byte-
        // identical content stays refined away.
        if survivors == 0 && any_delta {
            for y in bbox.y..bbox.y + bbox.height {
                for x in bbox.x..bbox.x + bbox.width {
                    let idx = (y * width + x) as usize;
                    refined[idx] = input_mask[idx];
                }
            }
        }
    }
    refined
}

fn count_mask_pixels(mask: &[bool], bbox: &types::BoundingBox, width: u32) -> u32 {
    let mut pixel_count = 0u32;
    for y in bbox.y..bbox.y + bbox.height {
        for x in bbox.x..bbox.x + bbox.width {
            if mask[(y * width + x) as usize] {
                pixel_count += 1;
            }
        }
    }
    pixel_count
}

fn classify_region_with_mask(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: types::BoundingBox,
) -> ChangeRegion {
    let width = img1.width;
    let height = img1.height;
    let total_pixels = (width * height) as f64;
    let pixel_count = count_mask_pixels(mask, &bbox, width);
    let percentage = if total_pixels > 0.0 {
        100.0 * pixel_count as f64 / total_pixels
    } else {
        0.0
    };
    let shape_stats = compute_shape_stats(mask, width, &bbox, pixel_count);
    let shape = classify_shape(&shape_stats);
    let position = classify_position(&bbox, width, height);

    let color_delta = compute_color_delta(img1, img2, mask, &bbox, width);
    let gradient_stats = compute_gradient_stats(img1, img2, mask, &bbox, width, height);
    let luminance_ncc = compute_luminance_ncc(img1, img2, mask, &bbox, width);
    let content = analyze_content(img1, img2, mask, &bbox, width, height);
    let chroma_stats = compute_chroma_stats(img1, img2, mask, &bbox, width);
    let (change_type, signals) = classify_change_type(
        &content,
        &color_delta,
        &gradient_stats,
        &shape_stats,
        &chroma_stats,
        &bbox,
        luminance_ncc,
    );

    ChangeRegion {
        bbox,
        pixel_count,
        percentage,
        position,
        shape,
        shape_stats,
        change_type,
        signals,
        confidence: signals.confidence,
        color_delta,
        gradient: gradient_stats,
        chroma: chroma_stats,
    }
}

/// Classify a known change region against a provided full-image change mask.
///
/// The mask is evaluated only inside `bbox`, so callers may pass a sparse mask
/// with one or more labeled regions already marked.
pub fn classify_region(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bbox: types::BoundingBox,
) -> ChangeRegion {
    classify_region_with_mask(img1, img2, mask, bbox)
}

/// Classify multiple known regions, then run the same shift relabeling pass used
/// by `interpret()` so classifier-only verification can evaluate final labels.
///
/// The caller-supplied `mask` may be coarse (e.g., bbox-filled for verifier
/// tooling); we refine it to actually-changed pixels inside each bbox before
/// classification so per-pixel statistics aren't diluted by unchanged content.
pub fn classify_regions(
    img1: &Image,
    img2: &Image,
    mask: &[bool],
    bboxes: &[types::BoundingBox],
) -> Vec<ChangeRegion> {
    let width = img1.width;
    let refined = refine_change_mask_in_bboxes(img1, img2, mask, bboxes, width);
    let mut regions: Vec<ChangeRegion> = bboxes
        .iter()
        .copied()
        .map(|bbox| classify_region_with_mask(img1, img2, &refined, bbox))
        .collect();
    detect_shifts(&mut regions, img1, img2, &refined, width);
    regions
}

/// Where the change information came from.
///
/// Each variant is what one of the producers hands back, taken by name: this
/// crate sits above them and consumes their results, rather than either of them
/// depending on it. What differs between the variants is only the precision of
/// the description, and whether it needs refining.
pub enum ChangeSource<'a> {
    /// What [`blazediff::diff`] returns: its result plus the visualization it
    /// wrote. Changed pixels are the non-grayscale ones, so the mask is exact
    /// and is used as-is; the counts come from the diff rather than being
    /// recomputed, because it knows which pixels it excluded as anti-aliasing.
    ///
    /// The diff must have been run with [`mask_options`] so the visualization
    /// is readable as a mask whatever colours the caller wanted.
    Diff {
        result: &'a DiffResult,
        output: &'a Image,
    },
    /// What any [`blazediff_ssim`] metric returns. Cells scoring below `floor`
    /// are changed. The map's grid is coarser than a pixel, so the boxes it
    /// yields are refined against the source pixels before anything is
    /// measured.
    Ssim {
        outcome: &'a SsimOutcome,
        floor: f32,
    },
    /// Regions the caller already knows — DOM rectangles, a crop list, anything.
    /// Refined like a score map, so they may be as coarse as you like.
    Regions(&'a [BoundingBox]),
}

/// Stable non-grayscale marker colors, so a mask can be read back out of a
/// diff visualization whatever colours the caller asked for — including
/// grayscale ones, which would otherwise be indistinguishable from background.
const MASK_DIFF_COLOR: [u8; 3] = [255, 0, 0];
const MASK_DIFF_COLOR_ALT: [u8; 3] = [0, 0, 255];
const MASK_AA_COLOR: [u8; 3] = [255, 255, 0];

/// The [`DiffOptions`] a diff must run with for [`ChangeSource::Diff`] to be
/// able to recover its mask.
///
/// Everything except the three marker colours is taken from `options`, so
/// threshold and anti-aliasing behave exactly as the caller asked.
pub fn mask_options(options: &DiffOptions) -> DiffOptions {
    DiffOptions {
        aa_color: MASK_AA_COLOR,
        diff_color: MASK_DIFF_COLOR,
        diff_color_alt: Some(MASK_DIFF_COLOR_ALT),
        ..options.clone()
    }
}

/// Repaint a mask-coloured visualization in the caller's palette.
///
/// Call it after [`interpret`] has read the mask, never before.
pub fn recolor_output(output: &mut Image, options: &DiffOptions) {
    let diff_color_alt = options.diff_color_alt.unwrap_or(options.diff_color);

    for pixel in output.data.chunks_exact_mut(4) {
        let color = match [pixel[0], pixel[1], pixel[2]] {
            MASK_DIFF_COLOR => options.diff_color,
            MASK_DIFF_COLOR_ALT => diff_color_alt,
            MASK_AA_COLOR => options.aa_color,
            _ => continue,
        };
        pixel[..3].copy_from_slice(&color);
    }
}

/// Run a pixel diff and interpret it, optionally keeping the visualization.
///
/// The convenience path for the common case: it applies [`mask_options`],
/// runs [`blazediff::diff`], interprets the result, and repaints the output in
/// the caller's colours afterwards.
pub fn interpret_diff(
    image1: &Image,
    image2: &Image,
    output: Option<&mut Image>,
    options: &DiffOptions,
) -> Result<InterpretResult, InterpretError> {
    // The diff has to paint its mask somewhere, so a caller that doesn't want
    // the visualization still needs a buffer — but only that caller: allocating
    // one unconditionally would double the peak memory of every call that does.
    let mut scratch;
    let (diff_output, retain_output) = match output {
        Some(image) => (image, true),
        None => {
            scratch = Image::new_uninit(image1.width, image1.height);
            (&mut scratch, false)
        }
    };

    let result = blazediff::diff(image1, image2, Some(diff_output), &mask_options(options))
        .map_err(|e| InterpretError::Producer(e.to_string()))?;

    // Read the mask out of the marker colours before repainting them.
    let interpreted = interpret(
        image1,
        image2,
        ChangeSource::Diff {
            result: &result,
            output: diff_output,
        },
    )?;

    if retain_output {
        recolor_output(diff_output, options);
    }

    Ok(interpreted)
}

/// Describe what changed between two images.
///
/// The single entry point: a pixel diff, a similarity metric and a caller
/// passing its own boxes all come through here and get identical treatment,
/// because the statistics are computed from the source pixels either way.
///
/// `diff_count` therefore means the same thing on every path — actually-changed
/// pixels, never map windows.
pub fn interpret(
    image1: &Image,
    image2: &Image,
    source: ChangeSource<'_>,
) -> Result<InterpretResult, InterpretError> {
    let (width, height) = (image1.width, image1.height);
    if width != image2.width || height != image2.height {
        return Err(InterpretError::SizeMismatch {
            img1_width: width,
            img1_height: height,
            img2_width: image2.width,
            img2_height: image2.height,
        });
    }

    // A diff that found nothing may leave its output buffer *uninitialized* —
    // see `Image::new_uninit` — so the mask must not be read in that case.
    if let ChangeSource::Diff { result, .. } = &source {
        if result.identical {
            return Ok(InterpretResult {
                summary: "Images are identical".to_string(),
                diff_count: 0,
                total_regions: 0,
                regions: Vec::new(),
                severity: classify_severity(0.0),
                diff_percentage: 0.0,
                width,
                height,
            });
        }
    }

    let total_pixels = (width as f64) * (height as f64);

    let margin_output = matches!(source, ChangeSource::Diff { .. });

    // Each arm produces the regions, the mask the shift pass should read, and
    // — for the diff, which knows better than we do — its own counts.
    let (mut regions, mut mask, counts) = match source {
        ChangeSource::Diff { result, output } => {
            let mask = extract_change_mask(&output.data, width, height);
            let mut components = detect_regions(&mask, width, height);
            // Noise census: the count of speck-sized components is a robust
            // readout of how noisy this pair is. Clean renders produce none;
            // recompressed or regenerated photos produce hundreds. The noise
            // floor below scales with it, so clean pairs keep their smallest
            // real regions while noisy pairs shed their fragment storm.
            let n_small = components
                .iter()
                .filter(|c| c.pixel_count < NOISE_CENSUS_PIXELS)
                .count();
            let area_floor = (NOISE_FLOOR_PER_SPECK * n_small as f64) as u32;
            components.retain(|component| component.pixel_count >= SPECK_FLOOR);
            let mut components = if components.len() > 1 {
                let density = ChangeDensity::new(image1, image2);
                merge_overlapping_components(components, MERGE_SLACK_X, MERGE_SLACK_Y, &density)
            } else {
                components
            };
            components.retain(|component| component.pixel_count >= area_floor.max(NOISE_FLOOR_MIN));
            let regions = components
                .into_iter()
                .map(|component| {
                    let mut region =
                        classify_region_with_mask(image1, image2, &mask, component.bbox);
                    region.pixel_count = component.pixel_count;
                    region.percentage = if total_pixels > 0.0 {
                        100.0 * component.pixel_count as f64 / total_pixels
                    } else {
                        0.0
                    };
                    region
                })
                .collect::<Vec<_>>();
            (
                regions,
                mask,
                Some((result.diff_count, result.diff_percentage)),
            )
        }
        ChangeSource::Ssim { outcome, floor } => {
            let boxes = regions_from_score_map(
                &outcome.map,
                outcome.map_width,
                outcome.map_height,
                width,
                height,
                floor,
            );
            let (regions, mask) = classify_coarse(image1, image2, &boxes)?;
            (regions, mask, None)
        }
        ChangeSource::Regions(boxes) => {
            let (regions, mask) = classify_coarse(image1, image2, boxes)?;
            (regions, mask, None)
        }
    };

    detect_shifts(&mut regions, image1, image2, &mask, width);
    regions.retain(|region| region.change_type != ChangeType::RenderingNoise);

    // Detected regions get a small scale-relative margin: thresholded pixels
    // systematically under-cover the perceptual change (anti-aliased fringes,
    // the unchanged interior padding of a recolored element), so the reported
    // box extends slightly past them. Caller-supplied and score-map boxes are
    // echoed exactly.
    if margin_output {
        for region in &mut regions {
            let bbox = &mut region.bbox;
            let pad_x = (bbox.width / MARGIN_DIVISOR).clamp(MARGIN_MIN, MARGIN_MAX);
            let pad_y = (bbox.height / MARGIN_DIVISOR).clamp(MARGIN_MIN, MARGIN_MAX);
            let x0 = bbox.x.saturating_sub(pad_x);
            let y0 = bbox.y.saturating_sub(pad_y);
            let x1 = (bbox.x + bbox.width + pad_x).min(width);
            let y1 = (bbox.y + bbox.height + pad_y).min(height);
            bbox.x = x0;
            bbox.y = y0;
            bbox.width = x1 - x0;
            bbox.height = y1 - y0;
        }
    }

    // A coarse source has no authoritative count of its own, so it comes from
    // the pixels that survived refinement — counted over the union of the
    // boxes, because a coarse source is free to overlap them and DOM
    // rectangles routinely do.
    let (diff_count, diff_percentage) = counts.unwrap_or_else(|| {
        let count = count_masked_union(&mut mask, width, &regions);
        let percentage = if total_pixels > 0.0 {
            100.0 * count as f64 / total_pixels
        } else {
            0.0
        };
        (count, percentage)
    });

    if regions.is_empty() && diff_count == 0 {
        return Ok(InterpretResult {
            summary: "Images are identical".to_string(),
            diff_count: 0,
            total_regions: 0,
            regions: Vec::new(),
            severity: classify_severity(0.0),
            diff_percentage: 0.0,
            width,
            height,
        });
    }

    let severity = classify_severity(diff_percentage);
    let summary = build_summary(&regions, &severity, diff_percentage);

    Ok(InterpretResult {
        summary,
        diff_count,
        total_regions: regions.len(),
        regions,
        severity,
        diff_percentage,
        width,
        height,
    })
}

/// Classify boxes that may be coarser than a pixel: fill them into a mask,
/// refine that against the source pixels, then measure.
fn classify_coarse(
    image1: &Image,
    image2: &Image,
    boxes: &[BoundingBox],
) -> Result<(Vec<ChangeRegion>, Vec<bool>), InterpretError> {
    let (width, height) = (image1.width, image1.height);
    let total_pixels = (width as f64) * (height as f64);

    for bbox in boxes {
        // u32 arithmetic, so check the sums for overflow rather than trusting
        // `x + width <= image_width` to stay in range.
        let right = bbox.x.checked_add(bbox.width);
        let bottom = bbox.y.checked_add(bbox.height);
        let fits = matches!((right, bottom), (Some(r), Some(b)) if r <= width && b <= height);
        if !fits {
            return Err(InterpretError::RegionOutOfBounds {
                bbox: *bbox,
                width,
                height,
            });
        }
    }

    let mut mask = vec![false; (width * height) as usize];
    for bbox in boxes {
        for y in bbox.y..bbox.y + bbox.height {
            let row = (y * width) as usize;
            mask[row + bbox.x as usize..row + (bbox.x + bbox.width) as usize].fill(true);
        }
    }
    let refined = refine_change_mask_in_bboxes(image1, image2, &mask, boxes, width);

    let regions = boxes
        .iter()
        .copied()
        .map(|bbox| {
            let mut region = classify_region_with_mask(image1, image2, &refined, bbox);
            region.percentage = if total_pixels > 0.0 {
                100.0 * region.pixel_count as f64 / total_pixels
            } else {
                0.0
            };
            region
        })
        .collect();

    Ok((regions, refined))
}

/// Count the changed pixels under `regions`, charging one shared by two boxes
/// only once.
///
/// Overlap is normal for a coarse source — DOM rectangles nest and overlap —
/// and summing each region's own `pixel_count` would count the shared pixels
/// twice, which can push `diff_percentage` past 100%. Each pixel is cleared as
/// it is counted, so a second box over it finds nothing left to count.
fn count_masked_union(mask: &mut [bool], width: u32, regions: &[ChangeRegion]) -> u32 {
    let mut count = 0;
    for region in regions {
        let bbox = region.bbox;
        for y in bbox.y..bbox.y + bbox.height {
            let row = (y * width) as usize;
            for pixel in &mut mask[row + bbox.x as usize..row + (bbox.x + bbox.width) as usize] {
                if *pixel {
                    *pixel = false;
                    count += 1;
                }
            }
        }
    }
    count
}

#[cfg(test)]
mod region_entry_tests {
    use super::*;
    use crate::test_helpers::*;

    fn bbox(x: u32, y: u32, width: u32, height: u32) -> BoundingBox {
        BoundingBox {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn no_regions_means_identical() {
        let a = make_solid_image(64, 64, 10, 20, 30);
        let result = interpret(&a, &a, ChangeSource::Regions(&[])).unwrap();
        assert_eq!(result.summary, "Images are identical");
        assert_eq!(result.diff_count, 0);
        assert_eq!(result.total_regions, 0);
    }

    #[test]
    fn a_region_over_unchanged_pixels_contributes_nothing() {
        let a = make_solid_image(64, 64, 10, 20, 30);
        let result = interpret(&a, &a, ChangeSource::Regions(&[bbox(8, 8, 16, 16)])).unwrap();
        assert_eq!(result.diff_count, 0);
        assert_eq!(result.diff_percentage, 0.0);
    }

    #[test]
    fn a_changed_region_is_classified() {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);

        let result = interpret(&a, &b, ChangeSource::Regions(&[bbox(16, 16, 8, 8)])).unwrap();
        assert_eq!(result.total_regions, 1);
        assert_eq!(result.diff_count, 64);
        assert_eq!(result.regions[0].bbox, bbox(16, 16, 8, 8));
    }

    /// Caller-supplied boxes overlap all the time — nested DOM rectangles do —
    /// and a pixel under two of them still changed once. Summing each region's
    /// own count would report it twice and can push the percentage past 100.
    #[test]
    fn overlapping_regions_count_a_shared_pixel_once() {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);

        // Both boxes enclose the whole 8x8 change.
        let result = interpret(
            &a,
            &b,
            ChangeSource::Regions(&[bbox(8, 8, 24, 24), bbox(16, 16, 16, 16)]),
        )
        .unwrap();

        assert_eq!(result.diff_count, 64);
        assert_eq!(result.diff_percentage, 100.0 * 64.0 / (64.0 * 64.0));
    }

    /// The point of the regions-in API: a producer that only knows a coarse
    /// box still gets per-pixel counts, because the mask is refined against the
    /// source pixels before anything is measured.
    #[test]
    fn a_coarse_region_still_yields_per_pixel_counts() {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);

        let exact = interpret(&a, &b, ChangeSource::Regions(&[bbox(16, 16, 8, 8)])).unwrap();
        // Quantized to a 16px grid, as an SSIM window map would give.
        let coarse = interpret(&a, &b, ChangeSource::Regions(&[bbox(16, 16, 16, 16)])).unwrap();

        assert_eq!(coarse.diff_count, exact.diff_count);
        assert_eq!(coarse.regions[0].pixel_count, exact.regions[0].pixel_count);
    }

    #[test]
    fn mismatched_sizes_are_rejected() {
        let a = make_solid_image(64, 64, 0, 0, 0);
        let b = make_solid_image(32, 64, 0, 0, 0);
        assert!(matches!(
            interpret(&a, &b, ChangeSource::Regions(&[])),
            Err(InterpretError::SizeMismatch { .. })
        ));
    }

    #[test]
    fn an_out_of_bounds_region_is_rejected_rather_than_panicking() {
        let a = make_solid_image(64, 64, 0, 0, 0);
        for out in [
            bbox(60, 0, 8, 8),
            bbox(0, 60, 8, 8),
            bbox(u32::MAX, 0, 8, 8),
        ] {
            assert!(
                matches!(
                    interpret(&a, &a, ChangeSource::Regions(&[out])),
                    Err(InterpretError::RegionOutOfBounds { .. })
                ),
                "{out:?} should be rejected"
            );
        }
    }
}

/// Turn a lower-resolution scalar score map into regions in image coordinates.
///
/// This is how a similarity metric becomes a region producer: threshold its
/// local map at `floor`, take connected components at map resolution, then
/// scale each box back up. The result is deliberately coarse — a box is only
/// ever as precise as the map's grid — but [`interpret`] refines
/// against the source pixels before measuring anything, so the statistics it
/// derives are still per-pixel.
///
/// Scores are "higher is more similar", matching `blazediff-ssim`, so a cell
/// counts as changed when it falls *below* `floor`. `NaN` cells count as
/// changed: `ms-ssim` with product pooling yields `NaN` on globally
/// anticorrelated content, which is emphatically not a match.
pub fn regions_from_score_map(
    map: &[f32],
    map_width: usize,
    map_height: usize,
    width: u32,
    height: u32,
    floor: f32,
) -> Vec<BoundingBox> {
    if map_width == 0 || map_height == 0 || width == 0 || height == 0 {
        return Vec::new();
    }
    if map.len() < map_width * map_height {
        return Vec::new();
    }

    let changed: Vec<bool> = map[..map_width * map_height]
        .iter()
        .map(|score| !(*score >= floor))
        .collect();

    // Map cell `m` covers image pixels [m * size / map_size, (m + 1) * size / map_size),
    // so the same floor division gives both edges and the cells tile the image
    // exactly. Rounding the upper edge up instead would widen every box by a
    // pixel and make the boxes of two adjacent components overlap.
    let scale =
        |m: u32, size: u32, map_size: u32| (m as u64 * size as u64 / map_size as u64) as u32;

    detect_regions(&changed, map_width as u32, map_height as u32)
        .into_iter()
        .filter_map(|component| {
            let bbox = component.bbox;
            let x = scale(bbox.x, width, map_width as u32);
            let y = scale(bbox.y, height, map_height as u32);
            let right = scale(bbox.x + bbox.width, width, map_width as u32);
            let bottom = scale(bbox.y + bbox.height, height, map_height as u32);
            // A map cell can scale to zero pixels when the map is larger than
            // the image, which `ssim`'s 'valid' convolution never produces but
            // a caller-supplied map might.
            (right > x && bottom > y).then_some(BoundingBox {
                x,
                y,
                width: right - x,
                height: bottom - y,
            })
        })
        .collect()
}

#[cfg(test)]
mod score_map_tests {
    use super::*;

    #[test]
    fn an_all_similar_map_yields_no_regions() {
        let map = vec![1.0f32; 4 * 4];
        assert!(regions_from_score_map(&map, 4, 4, 64, 64, 0.99).is_empty());
    }

    #[test]
    fn a_low_cell_becomes_a_scaled_box() {
        let mut map = vec![1.0f32; 4 * 4];
        map[5] = 0.1; // cell (1, 1) of a 4x4 map over a 64x64 image
        let regions = regions_from_score_map(&map, 4, 4, 64, 64, 0.99);
        assert_eq!(
            regions,
            vec![BoundingBox {
                x: 16,
                y: 16,
                width: 16,
                height: 16
            }]
        );
    }

    /// The cells tile the image exactly, so a box stops where the next cell
    /// starts — including when the image size isn't a multiple of the map's,
    /// which is every 'valid' convolution the metrics produce. Rounding the
    /// upper edge up instead would hand two adjacent components a shared pixel.
    #[test]
    fn a_cell_maps_to_its_exact_slice_of_a_non_divisible_image() {
        let mut map = vec![1.0f32; 3 * 3];
        map[4] = 0.1; // cell (1, 1) of a 3x3 map over a 64x64 image
        let regions = regions_from_score_map(&map, 3, 3, 64, 64, 0.99);
        assert_eq!(
            regions,
            vec![BoundingBox {
                x: 21,
                y: 21,
                width: 21,
                height: 21
            }]
        );
    }

    #[test]
    fn adjacent_cells_merge_into_one_region() {
        let mut map = vec![1.0f32; 4 * 4];
        map[5] = 0.1;
        map[6] = 0.1;
        let regions = regions_from_score_map(&map, 4, 4, 64, 64, 0.99);
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].width, 32);
    }

    #[test]
    fn nan_counts_as_changed() {
        let mut map = vec![1.0f32; 4 * 4];
        map[0] = f32::NAN;
        assert_eq!(regions_from_score_map(&map, 4, 4, 64, 64, 0.99).len(), 1);
    }

    #[test]
    fn a_degenerate_map_yields_nothing() {
        assert!(regions_from_score_map(&[], 0, 0, 64, 64, 0.99).is_empty());
        assert!(regions_from_score_map(&[0.0], 4, 4, 64, 64, 0.99).is_empty());
    }
}

#[cfg(test)]
mod source_parity_tests {
    use super::*;
    use crate::test_helpers::*;
    use blazediff_ssim::{ssim, Plane, Rgba8, SsimOptions};

    fn pair() -> (Image, Image) {
        let a = make_solid_image(64, 64, 255, 255, 255);
        let mut b = make_solid_image(64, 64, 255, 255, 255);
        fill_block(&mut b, 16, 16, 8, 8, 0, 0, 0);
        (a, b)
    }

    /// A pixel diff and an SSIM map are two descriptions of the same change, so
    /// interpreting either must reach the same conclusion. That symmetry is the
    /// whole point of one entry point taking both producers' results.
    #[test]
    fn a_diff_and_an_ssim_map_agree() {
        let (a, b) = pair();
        let options = DiffOptions::default();

        let mut output = Image::new_uninit(a.width, a.height);
        let result = blazediff::diff(&a, &b, Some(&mut output), &mask_options(&options)).unwrap();
        let from_diff = interpret(
            &a,
            &b,
            ChangeSource::Diff {
                result: &result,
                output: &output,
            },
        )
        .unwrap();

        let plane = |image: &Image| Plane::from_rgba8(Rgba8::new(&image.data, 64, 64)).unwrap();
        let outcome = ssim(&plane(&a), &plane(&b), &SsimOptions::default()).unwrap();
        let from_ssim = interpret(
            &a,
            &b,
            ChangeSource::Ssim {
                outcome: &outcome,
                floor: 0.99,
            },
        )
        .unwrap();

        assert_eq!(from_diff.total_regions, 1);
        assert_eq!(from_ssim.total_regions, 1);

        // The boxes differ, and are meant to: the diff localizes the change
        // to the pixel and reports it with a small presentation margin, the
        // map only knows its window. Both must enclose the true change.
        let change = BoundingBox {
            x: 16,
            y: 16,
            width: 8,
            height: 8,
        };
        let encloses = |outer: &BoundingBox, inner: &BoundingBox| {
            outer.x <= inner.x
                && outer.y <= inner.y
                && outer.x + outer.width >= inner.x + inner.width
                && outer.y + outer.height >= inner.y + inner.height
        };
        let (margined, coarse) = (from_diff.regions[0].bbox, from_ssim.regions[0].bbox);
        assert!(
            encloses(&margined, &change),
            "{margined:?} should enclose {change:?}"
        );
        // The margin is bounded: no more than MARGIN_MAX past the change.
        assert!(margined.x + margined.width <= change.x + change.width + MARGIN_MAX);
        assert!(margined.width <= change.width + 2 * MARGIN_MAX);
        assert!(
            encloses(&coarse, &change),
            "{coarse:?} should enclose {change:?}"
        );

        // What must match is everything measured from the pixels.
        assert_eq!(
            from_diff.regions[0].change_type,
            from_ssim.regions[0].change_type
        );
        assert_eq!(from_diff.diff_count, 64);
        assert_eq!(from_ssim.diff_count, 64);
    }

    #[test]
    fn an_unchanged_pair_is_identical_from_either_source() {
        let a = make_solid_image(64, 64, 10, 20, 30);
        let options = DiffOptions::default();

        let mut output = Image::new_uninit(64, 64);
        let result = blazediff::diff(&a, &a, Some(&mut output), &mask_options(&options)).unwrap();
        let from_diff = interpret(
            &a,
            &a,
            ChangeSource::Diff {
                result: &result,
                output: &output,
            },
        )
        .unwrap();
        assert_eq!(from_diff.summary, "Images are identical");

        let plane = Plane::from_rgba8(Rgba8::new(&a.data, 64, 64)).unwrap();
        let outcome = ssim(&plane, &plane, &SsimOptions::default()).unwrap();
        let from_ssim = interpret(
            &a,
            &a,
            ChangeSource::Ssim {
                outcome: &outcome,
                floor: 0.99,
            },
        )
        .unwrap();
        assert_eq!(from_ssim.summary, "Images are identical");
    }
}

#[cfg(test)]
mod diff_source_tests {

    use super::*;
    use crate::test_helpers::*;
    use blazediff::{diff, DiffOptions};
    use types::*;
    #[test]
    fn test_identical_images() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let img2 = make_solid_image(100, 100, 128, 128, 128);
        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 0);
        assert!(result.regions.is_empty());
        assert_eq!(result.severity, ChangeSeverity::Low);
        assert_eq!(result.diff_percentage, 0.0);
        assert_eq!(result.summary, "Images are identical");
    }

    #[test]
    fn test_single_pixel_change_is_filtered_as_noise() {
        // Subtle single-pixel deltas sit below interpret()'s noise floor, so
        // they don't show up as actionable regions.
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        set_pixel(&mut img2, 50, 50, 130, 130, 130);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 0);
        assert!(result.regions.is_empty());
    }

    #[test]
    fn test_interpret_with_output_matches_diff() {
        let img1 = make_solid_image(32, 32, 200, 200, 200);
        let img2 = make_solid_image(32, 32, 50, 50, 50);
        let options = DiffOptions {
            include_aa: true,
            diff_color_alt: Some([0, 128, 255]),
            ..Default::default()
        };
        let mut expected = Image::new(32, 32);
        let diff_result = diff(&img1, &img2, Some(&mut expected), &options).unwrap();
        let mut actual = Image::new(32, 32);

        let interpretation = interpret_diff(&img1, &img2, Some(&mut actual), &options).unwrap();

        assert_eq!(interpretation.diff_count, diff_result.diff_count);
        assert_eq!(actual.data, expected.data);
    }

    #[test]
    fn test_interpret_with_grayscale_alt_color_keeps_regions() {
        let img1 = make_solid_image(32, 32, 200, 200, 200);
        let img2 = make_solid_image(32, 32, 50, 50, 50);
        let options = DiffOptions {
            include_aa: true,
            diff_color_alt: Some([32, 32, 32]),
            ..Default::default()
        };
        let mut output = Image::new(32, 32);

        let result = interpret_diff(&img1, &img2, Some(&mut output), &options).unwrap();

        assert_eq!(result.diff_count, 32 * 32);
        assert!(result.total_regions > 0);
        assert_eq!(&output.data[..4], &[32, 32, 32, 255]);
    }

    #[test]
    fn test_block_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 255, 0, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].position, SpatialPosition::TopLeft);
        assert_eq!(result.severity, ChangeSeverity::High);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
        assert!(result.summary.contains("Content added"));
    }

    #[test]
    fn test_block_deletion() {
        let mut img1 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img1, 0, 0, 40, 40, 255, 0, 0);
        let img2 = make_solid_image(100, 100, 128, 128, 128);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].change_type, ChangeType::Deletion);
        assert!(result.summary.contains("Content removed"));
    }

    #[test]
    fn test_scattered_additions() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);
        fill_block(&mut img2, 80, 80, 10, 10, 0, 255, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 2);
        let positions: Vec<SpatialPosition> = result.regions.iter().map(|r| r.position).collect();
        assert!(positions.contains(&SpatialPosition::TopLeft));
        assert!(positions.contains(&SpatialPosition::BottomRight));
        assert!(result
            .regions
            .iter()
            .all(|r| r.change_type == ChangeType::Addition));
    }

    #[test]
    fn test_full_image_color_change() {
        let img1 = make_solid_image(100, 100, 0, 0, 0);
        let img2 = make_solid_image(100, 100, 255, 255, 255);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.severity, ChangeSeverity::High);
        assert!(result.diff_percentage > 90.0);
        assert_eq!(result.regions[0].shape, ChangeShape::SolidRegion);
        assert!(
            matches!(
                result.regions[0].change_type,
                ChangeType::ColorChange | ChangeType::ContentChange
            ),
            "Expected ColorChange or ContentChange for full image swap, got: {:?}",
            result.regions[0].change_type
        );
    }

    #[test]
    fn test_severity_boundaries() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);

        let mut img2_low = make_solid_image(100, 100, 128, 128, 128);
        for i in 0..50 {
            set_pixel(&mut img2_low, i % 100, i / 100, 255, 0, 0);
        }
        let result_low = interpret_diff(&img1, &img2_low, None, &DiffOptions::default()).unwrap();
        assert_eq!(result_low.severity, ChangeSeverity::Low);

        let mut img2_med = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2_med, 0, 0, 20, 25, 255, 0, 0);
        let result_med = interpret_diff(&img1, &img2_med, None, &DiffOptions::default()).unwrap();
        assert_eq!(result_med.severity, ChangeSeverity::Medium);

        let mut img2_high = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2_high, 0, 0, 50, 50, 255, 0, 0);
        let result_high = interpret_diff(&img1, &img2_high, None, &DiffOptions::default()).unwrap();
        assert_eq!(result_high.severity, ChangeSeverity::High);
    }

    #[test]
    fn test_json_roundtrip() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 10, 10, 20, 20, 255, 0, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: InterpretResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result, deserialized);
    }

    #[test]
    fn test_hollow_frame_is_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);

        let bx = 35u32;
        let by = 35u32;
        let bw = 30u32;
        let bh = 30u32;
        for y in by..by + bh {
            for x in bx..bx + bw {
                if x == bx || x == bx + bw - 1 || y == by || y == by + bh - 1 {
                    set_pixel(&mut img2, x, y, 255, 0, 0);
                }
            }
        }

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].shape, ChangeShape::ContourFrame);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    #[test]
    fn test_sparse_noise() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);

        let bx = 10u32;
        let by = 10u32;
        let size = 80u32;
        for y in (by..by + size).step_by(6) {
            for x in bx..bx + size {
                set_pixel(&mut img2, x, y, 133, 133, 133);
            }
        }
        for x in (bx..bx + size).step_by(6) {
            for y in by..by + size {
                set_pixel(&mut img2, x, y, 133, 133, 133);
            }
        }

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        for r in &result.regions {
            assert_eq!(
                r.change_type,
                ChangeType::Addition,
                "Expected Addition for sparse subtle grid, got: {:?}",
                r.change_type
            );
        }
    }

    #[test]
    fn test_shift_detection() {
        let mut img1 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 20, 20, 40, 40, 40);

        let mut img2 = make_solid_image(100, 100, 255, 255, 255);
        fill_block(&mut img2, 60, 60, 20, 20, 40, 40, 40);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 2);
        assert!(
            result
                .regions
                .iter()
                .all(|r| r.change_type == ChangeType::Shift),
            "Expected both regions as Shift, got: {:?}",
            result
                .regions
                .iter()
                .map(|r| r.change_type)
                .collect::<Vec<_>>()
        );
        assert!(result.summary.contains("Content shifted"));
    }

    #[test]
    fn test_size_mismatch_error() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let img2 = make_solid_image(200, 200, 128, 128, 128);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default());
        assert!(result.is_err());
    }

    #[test]
    fn test_summary_format() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);
        fill_block(&mut img2, 80, 80, 10, 10, 0, 255, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert!(result.summary.contains("visual change detected"));
        assert!(result.summary.contains("2 regions"));
    }

    #[test]
    fn test_summary_has_descriptions() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 5, 5, 10, 10, 255, 0, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert!(result.summary.contains("region"));
        assert!(result.summary.lines().count() >= 2);
    }

    #[test]
    fn test_signals_populated() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 255, 0, 0);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        let region = &result.regions[0];
        assert!(region.confidence > 0.0);
        assert!(region.signals.blends_with_bg_in_img1);
    }

    #[test]
    fn test_grey_shift_is_addition() {
        let img1 = make_solid_image(100, 100, 128, 128, 128);
        let mut img2 = make_solid_image(100, 100, 128, 128, 128);
        fill_block(&mut img2, 0, 0, 40, 40, 220, 220, 220);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        assert_eq!(result.total_regions, 1);
        assert_eq!(result.regions[0].change_type, ChangeType::Addition);
    }

    #[test]
    fn test_shift_not_detected_for_different_sizes() {
        let mut img1 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img1, 10, 10, 40, 40, 40, 40, 40);

        let mut img2 = make_solid_image(200, 100, 255, 255, 255);
        fill_block(&mut img2, 140, 10, 10, 10, 40, 40, 40);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Different-sized blocks should not be detected as shift"
        );
    }

    #[test]
    fn test_shift_not_detected_for_different_luminance() {
        let mut img1 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img1, 10, 10, 30, 30, 20, 20, 20);

        let mut img2 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img2, 140, 10, 30, 30, 200, 50, 50);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Blocks with different luminance should not be shift"
        );
    }

    #[test]
    fn test_no_shift_when_only_additions() {
        let img1 = make_solid_image(200, 100, 200, 200, 200);
        let mut img2 = make_solid_image(200, 100, 200, 200, 200);
        fill_block(&mut img2, 10, 10, 30, 30, 40, 40, 40);
        fill_block(&mut img2, 140, 10, 30, 30, 40, 40, 40);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        let shift_count = result
            .regions
            .iter()
            .filter(|r| r.change_type == ChangeType::Shift)
            .count();
        assert_eq!(
            shift_count, 0,
            "Two additions with no deletion cannot form a shift"
        );
    }

    #[test]
    fn test_object_on_both_images_is_not_addition_or_deletion() {
        let mut img1 = make_solid_image(100, 100, 200, 200, 200);
        fill_block(&mut img1, 30, 30, 40, 40, 255, 0, 0);
        let mut img2 = make_solid_image(100, 100, 200, 200, 200);
        fill_block(&mut img2, 30, 30, 40, 40, 0, 0, 255);

        let result = interpret_diff(&img1, &img2, None, &DiffOptions::default()).unwrap();

        for r in &result.regions {
            assert!(
                r.change_type != ChangeType::Addition && r.change_type != ChangeType::Deletion,
                "Object present in both images should not be Addition or Deletion, got {:?}",
                r.change_type
            );
        }
    }
}
