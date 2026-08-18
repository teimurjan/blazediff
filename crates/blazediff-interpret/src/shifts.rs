use blazediff_shared::Image;

use super::types::{BoundingBox, ChangeRegion, ChangeType};

/// Minimum patch NCC for a content match between the vacated and landed
/// crops. Random photo patches rarely correlate this strongly at equal size.
const PATCH_NCC_FLOOR: f32 = 0.80;
/// NCC above which a failed match is worth retrying at small offsets:
/// detected boxes trail the true block edges by a few pixels when the moved
/// content blends into its destination, which decorrelates an otherwise
/// perfect match.
const PATCH_NCC_RETRY: f32 = 0.45;
/// Offset search radius for the retry, in pixels.
const PATCH_SEARCH_RADIUS: i64 = 3;
/// Maximum normalized mean absolute luminance difference for a patch match.
const PATCH_MAD_CEIL: f32 = 0.15;
/// For near-flat patches NCC is undefined; a tight mean-difference bound
/// stands in for it.
const FLAT_PATCH_MAD_CEIL: f32 = 0.05;
/// Variance floor below which a patch counts as flat.
const FLAT_VAR_FLOOR: f64 = 4.0;
/// Minimum luminance contrast between a flat crop and the ring around it for
/// the crop to count as content rather than background.
const FLAT_RING_CONTRAST: f64 = 20.0;

/// Post-classification pass: find region pairs where the content that left
/// one location in img1 is the content that appeared at another location in
/// img2, and relabel both halves Shift.
///
/// Candidates are wide — Addition, Deletion, ContentChange, ColorChange and
/// even RenderingNoise regions can be one half of a shift, because the
/// upstream classifier sees each location in isolation: a moved block landing
/// on similar content reads as ContentChange, a vacated spot with imperfect
/// background fill reads as ContentChange, and both halves of a low-contrast
/// move can read as Deletion. Precision comes from the *matcher* instead: the
/// img1 crop at the source must correlate with the img2 crop at the
/// destination (luminance NCC with a mean-difference bound), which unrelated
/// regions rarely satisfy. Pairs are matched best-score-first so a region
/// pairs with its true partner rather than the first plausible one.
pub fn detect_shifts(
    regions: &mut [ChangeRegion],
    img1: &Image,
    img2: &Image,
    _mask: &[bool],
    width: u32,
) {
    let candidates: Vec<usize> = regions
        .iter()
        .enumerate()
        .filter(|(_, r)| {
            matches!(
                r.change_type,
                ChangeType::Addition
                    | ChangeType::Deletion
                    | ChangeType::ContentChange
                    | ChangeType::ColorChange
                    | ChangeType::RenderingNoise
            )
        })
        .map(|(i, _)| i)
        .collect();

    // Score every plausible unordered pair in both directions; keep the best.
    let mut scored: Vec<(f32, usize, usize)> = Vec::new();
    for (ci, &a) in candidates.iter().enumerate() {
        for &b in &candidates[ci + 1..] {
            if !size_compatible(&regions[a].bbox, &regions[b].bbox) {
                continue;
            }
            // A shift needs at least one half that lost or gained content
            // relative to background; two pure recolors can't be a move.
            let kinds = (regions[a].change_type, regions[b].change_type);
            if matches!(kinds, (ChangeType::ColorChange, ChangeType::ColorChange)) {
                continue;
            }
            let forward = patch_match_score(img1, img2, &regions[a].bbox, &regions[b].bbox, width);
            let backward = patch_match_score(img1, img2, &regions[b].bbox, &regions[a].bbox, width);
            if let Some(score) = match (forward, backward) {
                (Some(f), Some(r)) => Some(f.max(r)),
                (one, None) => one,
                (None, one) => one,
            } {
                scored.push((score, a, b));
            }
        }
    }

    scored.sort_by(|x, y| y.0.partial_cmp(&x.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut matched = std::collections::HashSet::new();
    for (_, a, b) in scored {
        if matched.contains(&a) || matched.contains(&b) {
            continue;
        }
        matched.insert(a);
        matched.insert(b);
    }

    for &idx in &matched {
        regions[idx].change_type = ChangeType::Shift;
    }
}

fn size_compatible(a: &BoundingBox, b: &BoundingBox) -> bool {
    let w_ratio = a.width as f64 / b.width.max(1) as f64;
    let h_ratio = a.height as f64 / b.height.max(1) as f64;
    (0.55..=1.82).contains(&w_ratio) && (0.55..=1.82).contains(&h_ratio)
}

/// Compare the content of img1 at `from` with the content of img2 at `to`:
/// did what stood at `from` land at `to`? Both boxes are cropped to their
/// common size around their centers, then luminance NCC and normalized mean
/// absolute difference decide. Returns a match score, higher is better, or
/// `None` when the patches don't plausibly hold the same content.
fn patch_match_score(
    img1: &Image,
    img2: &Image,
    from: &BoundingBox,
    to: &BoundingBox,
    width: u32,
) -> Option<f32> {
    let w = from.width.min(to.width);
    let h = from.height.min(to.height);
    if w == 0 || h == 0 {
        return None;
    }
    let fx = from.x + (from.width - w) / 2;
    let fy = from.y + (from.height - h) / 2;
    let tx = to.x + (to.width - w) / 2;
    let ty = to.y + (to.height - h) / 2;
    let height = img1.height;

    let (ncc, mad, flat) = crop_ncc_mad(img1, img2, fx, fy, tx, ty, w, h, width);

    if flat {
        // Not enough texture for correlation; only a near-identical mean
        // qualifies, and it can't outrank a genuine textural match. Two flat
        // *background* crops also pass the mean test though — the vacated
        // spot in img2 against the untouched spot in img1 — so each crop
        // must additionally stand out from its own surroundings, which
        // background never does.
        let contrast1 = ring_contrast(img1, fx, fy, w, h, width);
        let contrast2 = ring_contrast(img2, tx, ty, w, h, width);
        let has_content = contrast1 > FLAT_RING_CONTRAST && contrast2 > FLAT_RING_CONTRAST;
        return (mad <= FLAT_PATCH_MAD_CEIL && has_content).then_some(-mad);
    }
    if ncc >= PATCH_NCC_FLOOR && mad <= PATCH_MAD_CEIL {
        return Some(ncc - mad);
    }

    // Borderline correlation: the detected boxes may trail the true content
    // by a few pixels, so retry the destination anchor at small offsets.
    if ncc >= PATCH_NCC_RETRY && w >= 8 && h >= 8 {
        let mut best: Option<f32> = None;
        for oy in -PATCH_SEARCH_RADIUS..=PATCH_SEARCH_RADIUS {
            for ox in -PATCH_SEARCH_RADIUS..=PATCH_SEARCH_RADIUS {
                if ox == 0 && oy == 0 {
                    continue;
                }
                let sx = tx as i64 + ox;
                let sy = ty as i64 + oy;
                if sx < 0 || sy < 0 || sx + w as i64 > width as i64 || sy + h as i64 > height as i64
                {
                    continue;
                }
                let (ncc, mad, flat) =
                    crop_ncc_mad(img1, img2, fx, fy, sx as u32, sy as u32, w, h, width);
                if !flat && ncc >= PATCH_NCC_FLOOR && mad <= PATCH_MAD_CEIL {
                    let score = ncc - mad;
                    if best.is_none_or(|b| score > b) {
                        best = Some(score);
                    }
                }
            }
        }
        return best;
    }

    None
}

/// Mean absolute luminance difference between a w×h crop at (x, y) and the
/// 1px ring just outside it (clipped to the image).
fn ring_contrast(img: &Image, x: u32, y: u32, w: u32, h: u32, width: u32) -> f64 {
    let pixels = img.as_u32();
    let height = img.height;

    let mut crop_sum = 0.0f64;
    for dy in 0..h {
        for dx in 0..w {
            crop_sum += luminance(pixels[((y + dy) * width + x + dx) as usize]) as f64;
        }
    }
    let crop_mean = crop_sum / (w as f64 * h as f64);

    let x0 = x.saturating_sub(1);
    let y0 = y.saturating_sub(1);
    let x1 = (x + w + 1).min(width);
    let y1 = (y + h + 1).min(height);
    let mut ring_sum = 0.0f64;
    let mut ring_count = 0u32;
    for ry in y0..y1 {
        for rx in x0..x1 {
            if rx >= x && rx < x + w && ry >= y && ry < y + h {
                continue;
            }
            ring_sum += luminance(pixels[(ry * width + rx) as usize]) as f64;
            ring_count += 1;
        }
    }
    if ring_count == 0 {
        return 0.0;
    }
    (crop_mean - ring_sum / ring_count as f64).abs()
}

/// Luminance NCC, mean absolute difference, and a flatness flag between the
/// img1 crop at (fx, fy) and the img2 crop at (tx, ty), both w×h.
#[allow(clippy::too_many_arguments)]
fn crop_ncc_mad(
    img1: &Image,
    img2: &Image,
    fx: u32,
    fy: u32,
    tx: u32,
    ty: u32,
    w: u32,
    h: u32,
    width: u32,
) -> (f32, f32, bool) {
    let pixels1 = img1.as_u32();
    let pixels2 = img2.as_u32();
    let n = (w as f64) * (h as f64);

    let mut sum1 = 0.0f64;
    let mut sum2 = 0.0f64;
    for dy in 0..h {
        for dx in 0..w {
            let i1 = ((fy + dy) * width + fx + dx) as usize;
            let i2 = ((ty + dy) * width + tx + dx) as usize;
            sum1 += luminance(pixels1[i1]) as f64;
            sum2 += luminance(pixels2[i2]) as f64;
        }
    }
    let mean1 = sum1 / n;
    let mean2 = sum2 / n;

    let mut cov = 0.0f64;
    let mut var1 = 0.0f64;
    let mut var2 = 0.0f64;
    let mut abs_diff = 0.0f64;
    for dy in 0..h {
        for dx in 0..w {
            let i1 = ((fy + dy) * width + fx + dx) as usize;
            let i2 = ((ty + dy) * width + tx + dx) as usize;
            let l1 = luminance(pixels1[i1]) as f64;
            let l2 = luminance(pixels2[i2]) as f64;
            let d1 = l1 - mean1;
            let d2 = l2 - mean2;
            cov += d1 * d2;
            var1 += d1 * d1;
            var2 += d2 * d2;
            abs_diff += (l1 - l2).abs();
        }
    }
    var1 /= n;
    var2 /= n;
    let mad = (abs_diff / n / 255.0) as f32;

    if var1 < FLAT_VAR_FLOOR || var2 < FLAT_VAR_FLOOR {
        return (0.0, mad, true);
    }
    let ncc = (cov / n / (var1 * var2).sqrt()).clamp(-1.0, 1.0) as f32;
    (ncc, mad, false)
}

#[inline(always)]
fn luminance(pixel: u32) -> f32 {
    let r = (pixel & 0xFF) as f32;
    let g = ((pixel >> 8) & 0xFF) as f32;
    let b = ((pixel >> 16) & 0xFF) as f32;
    0.299 * r + 0.587 * g + 0.114 * b
}
