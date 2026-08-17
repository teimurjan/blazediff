use super::content_analysis::{ContentEvidence, BG_BLEND_THRESHOLD};
use super::types::{
    BoundingBox, ChangeType, ClassificationSignals, ColorDeltaStats, GradientStats, ShapeStats,
};

/// NCC threshold above which the luminance pattern is treated as preserved
/// (i.e. the edit is a recolor on existing structure rather than a structural
/// replacement). Tuned against inpaint-style edits where pure binary edge
/// agreement saturates but raw luminance still tracks closely.
const STRUCTURE_PRESERVED_NCC: f32 = 0.55;
/// NCC threshold below which the structure is treated as genuinely replaced
/// (content change rather than recolor). Calibrated against inpaintcoco
/// where the ColorChange/ContentChange label boundary sits near NCC=0 — we
/// gate ContentChange on *both* low NCC and a patchy color delta so noisy
/// but structurally preserved recolors still get the ColorChange label.
const STRUCTURE_REPLACED_NCC: f32 = 0.05;
/// Asymmetry margin required to claim Addition/Deletion when the bg-blend
/// signal is ambiguous. Computed as `edge_score_img2 - edge_score_img1`.
const STRUCTURE_ASYMMETRY_MARGIN: f32 = 0.04;
/// Minimum YIQ-normalized mean delta needed to admit a ColorChange when the
/// `low_color_delta` flag is otherwise true. YIQ weights chroma less than
/// luminance, so a clearly visible chromatic-only recolor (e.g. Tailwind
/// `text-blue-600` → `text-red-600`, both ~equal luminance) lands around
/// 0.005–0.05 here — well above this floor but below `low_color_delta=0.05`.
/// Floor exists to keep sub-noise pixel jitter from getting upgraded.
const RECOLOR_MIN_MEAN_DELTA: f32 = 0.001;
/// Stricter NCC gate for the low-delta chromatic-recolor branch. Tighter than
/// `STRUCTURE_PRESERVED_NCC` so we don't admit photographic edits where
/// structure is only weakly preserved — empirical floor on html_color_pairs
/// UI recolors is NCC=0.88, so 0.88 keeps them while filtering noise.
const CHROMATIC_RECOLOR_NCC: f32 = 0.88;

pub fn classify_change_type(
    content: &ContentEvidence,
    color_delta: &ColorDeltaStats,
    gradient: &GradientStats,
    shape_stats: &ShapeStats,
    bbox: &BoundingBox,
    luminance_ncc: f32,
) -> (ChangeType, ClassificationSignals) {
    let bbox_area = bbox.width as u64 * bbox.height as u64;
    let tiny_region = bbox_area <= 25;
    let low_color_delta = color_delta.mean_delta < 0.05;
    let low_edge_change = gradient.edge_score < 0.05;
    let low_edge_img2 = gradient.edge_score_img2 < 0.05;
    let both_low_edges = low_edge_change && low_edge_img2;
    let edges_correlated = both_low_edges || gradient.edge_correlation > 0.85;
    let dense_fill = shape_stats.fill_ratio > 0.6;
    let sparse_fill = shape_stats.fill_ratio < 0.35;
    let blends_bg1 = content.bg_distance_img1 < BG_BLEND_THRESHOLD
        || (content.bg_distance_img2 > BG_BLEND_THRESHOLD
            && content.bg_distance_img1 < content.bg_distance_img2 * 0.5);
    let blends_bg2 = content.bg_distance_img2 < BG_BLEND_THRESHOLD
        || (content.bg_distance_img1 > BG_BLEND_THRESHOLD
            && content.bg_distance_img2 < content.bg_distance_img1 * 0.5);
    let structure_asymmetry = gradient.edge_score_img2 - gradient.edge_score;
    let structure_preserved = luminance_ncc > STRUCTURE_PRESERVED_NCC;
    let structure_replaced = luminance_ncc < STRUCTURE_REPLACED_NCC;

    let mut signals = ClassificationSignals {
        blends_with_bg_in_img1: blends_bg1,
        blends_with_bg_in_img2: blends_bg2,
        low_color_delta,
        low_edge_change,
        dense_fill,
        sparse_fill,
        tiny_region,
        edges_correlated,
        luminance_ncc,
        structure_asymmetry,
        confidence: 0.0,
    };

    // Rule 1: RenderingNoise - tiny regions with subtle color delta
    if tiny_region && low_color_delta {
        signals.confidence = 1.0;
        return (ChangeType::RenderingNoise, signals);
    }

    // Rule 2: RenderingNoise - sparse, subtle noise
    if sparse_fill && low_color_delta && low_edge_change {
        signals.confidence = matched_ratio(&[sparse_fill, low_color_delta, low_edge_change]);
        return (ChangeType::RenderingNoise, signals);
    }

    // Rule 3: Addition - img1 blends with bg, img2 carries distinct content.
    // Require either a strong bg-blend asymmetry or img2 gaining structure
    // that img1 didn't have, so inpaint-style ColorChange edits (where both
    // images carry plausible content) don't get pulled in.
    if blends_bg1 && !blends_bg2 {
        let strong_bg_asymmetry = content.bg_distance_img2 > content.bg_distance_img1 * 2.0;
        let gained_structure = structure_asymmetry > STRUCTURE_ASYMMETRY_MARGIN;
        if strong_bg_asymmetry || gained_structure || !structure_preserved {
            let edge_boost = low_edge_change && !low_edge_img2;
            signals.confidence = if edge_boost { 1.0 } else { 0.9 };
            return (ChangeType::Addition, signals);
        }
    }

    // Rule 4: Deletion - mirror of Rule 3.
    if !blends_bg1 && blends_bg2 {
        let strong_bg_asymmetry = content.bg_distance_img1 > content.bg_distance_img2 * 2.0;
        let lost_structure = structure_asymmetry < -STRUCTURE_ASYMMETRY_MARGIN;
        if strong_bg_asymmetry || lost_structure || !structure_preserved {
            let edge_boost = !low_edge_change && low_edge_img2;
            signals.confidence = if edge_boost { 1.0 } else { 0.9 };
            return (ChangeType::Deletion, signals);
        }
    }

    // Rule 5: ColorChange - meaningful color shift over an existing visual
    // pattern. The strongest evidence is luminance NCC: structure preserved
    // means the edit recolored existing content, not replaced it. We also
    // accept binary edge correlation as a fallback for graphical/UI edits
    // where NCC under-counts due to anti-aliasing. Patchy (high stddev) and
    // very low NCC together imply a true content replacement and fall
    // through to ContentChange.
    //
    // The `!low_color_delta` gate is loosened when structure is strongly
    // preserved (high NCC, correlated edges): YIQ weights luminance heavily,
    // so chromatic-only recolors on rendered UI (Tailwind text-blue → text-red
    // at matching luminance) produce a tiny mean delta but are unmistakably
    // visible. Rules 1 and 2 still take RenderingNoise cases first, so this
    // only affects non-tiny, non-sparse regions with confirmed structure.
    let highly_patchy = color_delta.delta_stddev > color_delta.mean_delta * 2.0 + 0.1;
    let recolor_evidence = structure_preserved
        || (edges_correlated && !highly_patchy)
        || (luminance_ncc > STRUCTURE_REPLACED_NCC && !highly_patchy);
    let chromatic_recolor = luminance_ncc > CHROMATIC_RECOLOR_NCC
        && edges_correlated
        && color_delta.mean_delta > RECOLOR_MIN_MEAN_DELTA;
    let delta_evidence = !low_color_delta || chromatic_recolor;
    if delta_evidence && !(structure_replaced && highly_patchy) && recolor_evidence {
        let ncc_boost = luminance_ncc.max(0.0);
        signals.confidence = ((color_delta.mean_delta * 5.0).min(1.0) * 0.5
            + ncc_boost as f32 * 0.5)
            .clamp(0.0, 1.0);
        return (ChangeType::ColorChange, signals);
    }

    // Rule 6: ContentChange - fallback
    signals.confidence = 0.5;
    (ChangeType::ContentChange, signals)
}

fn matched_ratio(conditions: &[bool]) -> f32 {
    let matched = conditions.iter().filter(|&&c| c).count();
    matched as f32 / conditions.len() as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_shape_stats() -> ShapeStats {
        ShapeStats {
            fill_ratio: 0.5,
            border_ratio: 0.3,
            inner_fill_ratio: 0.5,
            center_density: 0.5,
            row_occupancy: 0.5,
            col_occupancy: 0.5,
        }
    }

    fn square_bbox() -> BoundingBox {
        BoundingBox {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        }
    }

    fn blends_both() -> ContentEvidence {
        ContentEvidence {
            bg_distance_img1: 0.01,
            bg_distance_img2: 0.01,
        }
    }

    fn no_blends() -> ContentEvidence {
        ContentEvidence {
            bg_distance_img1: 0.50,
            bg_distance_img2: 0.50,
        }
    }

    /// Gradient stats where both images have no edges (flat regions, high correlation).
    fn flat_gradient() -> GradientStats {
        GradientStats {
            edge_score: 0.01,
            edge_score_img2: 0.01,
            edge_correlation: 0.99,
        }
    }

    /// Gradient stats where both images have similar edge structure.
    fn correlated_edges() -> GradientStats {
        GradientStats {
            edge_score: 0.20,
            edge_score_img2: 0.18,
            edge_correlation: 0.92,
        }
    }

    /// Gradient stats where img1 has edges but img2 doesn't (content removed).
    fn img1_only_edges() -> GradientStats {
        GradientStats {
            edge_score: 0.30,
            edge_score_img2: 0.02,
            edge_correlation: 0.40,
        }
    }

    /// Gradient stats where img2 has edges but img1 doesn't (content added).
    fn img2_only_edges() -> GradientStats {
        GradientStats {
            edge_score: 0.02,
            edge_score_img2: 0.30,
            edge_correlation: 0.40,
        }
    }

    /// Gradient stats with high edges in both but low correlation (structural change).
    fn uncorrelated_edges() -> GradientStats {
        GradientStats {
            edge_score: 0.30,
            edge_score_img2: 0.25,
            edge_correlation: 0.40,
        }
    }

    #[test]
    fn test_rendering_noise_tiny() {
        let (ct, signals) = classify_change_type(
            &blends_both(),
            &ColorDeltaStats {
                mean_delta: 0.01,
                max_delta: 0.02,
                delta_stddev: 0.005,
            },
            &flat_gradient(),
            &default_shape_stats(),
            &BoundingBox {
                x: 50,
                y: 50,
                width: 1,
                height: 1,
            },
            1.0,
        );
        assert_eq!(ct, ChangeType::RenderingNoise);
        assert!(signals.tiny_region);
        assert_eq!(signals.confidence, 1.0);
    }

    #[test]
    fn test_rendering_noise_sparse() {
        let stats = ShapeStats {
            fill_ratio: 0.10,
            ..default_shape_stats()
        };
        let (ct, signals) = classify_change_type(
            &blends_both(),
            &ColorDeltaStats {
                mean_delta: 0.02,
                max_delta: 0.04,
                delta_stddev: 0.01,
            },
            &flat_gradient(),
            &stats,
            &square_bbox(),
            1.0,
        );
        assert_eq!(ct, ChangeType::RenderingNoise);
        assert!(signals.sparse_fill);
        assert!(signals.low_color_delta);
        assert!(signals.low_edge_change);
    }

    #[test]
    fn test_addition() {
        let content = ContentEvidence {
            bg_distance_img1: 0.02,
            bg_distance_img2: 0.40,
        };
        let (ct, signals) = classify_change_type(
            &content,
            &ColorDeltaStats {
                mean_delta: 0.30,
                max_delta: 0.50,
                delta_stddev: 0.05,
            },
            &img2_only_edges(),
            &default_shape_stats(),
            &square_bbox(),
            0.0,
        );
        assert_eq!(ct, ChangeType::Addition);
        assert!(signals.blends_with_bg_in_img1);
        assert!(!signals.blends_with_bg_in_img2);
        // Edge boost: img1 has no edges, img2 does
        assert_eq!(signals.confidence, 1.0);
    }

    #[test]
    fn test_deletion() {
        let content = ContentEvidence {
            bg_distance_img1: 0.40,
            bg_distance_img2: 0.02,
        };
        let (ct, signals) = classify_change_type(
            &content,
            &ColorDeltaStats {
                mean_delta: 0.30,
                max_delta: 0.50,
                delta_stddev: 0.05,
            },
            &img1_only_edges(),
            &default_shape_stats(),
            &square_bbox(),
            0.0,
        );
        assert_eq!(ct, ChangeType::Deletion);
        assert!(!signals.blends_with_bg_in_img1);
        assert!(signals.blends_with_bg_in_img2);
        // Edge boost: img1 has edges, img2 lost them
        assert_eq!(signals.confidence, 1.0);
    }

    #[test]
    fn test_color_change_correlated_edges() {
        // Both images have similar edge structure, moderate color delta → ColorChange
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.20,
                max_delta: 0.30,
                delta_stddev: 0.03,
            },
            &correlated_edges(),
            &default_shape_stats(),
            &square_bbox(),
            0.95,
        );
        assert_eq!(ct, ChangeType::ColorChange);
        assert!(signals.edges_correlated);
        assert!(signals.confidence > 0.5);
    }

    #[test]
    fn test_color_change_flat_both() {
        // Both images are flat (no edges), high correlation, meaningful color delta → ColorChange
        let (ct, _) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.20,
                max_delta: 0.30,
                delta_stddev: 0.03,
            },
            &flat_gradient(),
            &default_shape_stats(),
            &square_bbox(),
            1.0,
        );
        assert_eq!(ct, ChangeType::ColorChange);
    }

    #[test]
    fn test_low_delta_preserved_structure_is_color_change() {
        // Both flat, low color delta, NCC=1.0, edges correlated → ColorChange.
        // Chromatic-only recolors on UI (matching luminance) live in this
        // regime: YIQ delta is small but the structure is unchanged.
        let stats = ShapeStats {
            fill_ratio: 0.95,
            ..default_shape_stats()
        };
        let (ct, _) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.02,
                max_delta: 0.04,
                delta_stddev: 0.01,
            },
            &flat_gradient(),
            &stats,
            &square_bbox(),
            1.0,
        );
        assert_eq!(ct, ChangeType::ColorChange);
    }

    #[test]
    fn test_subnoise_delta_falls_through_to_content_change() {
        // Even with preserved structure, a delta below RECOLOR_MIN_MEAN_DELTA
        // does not get upgraded — keeps sub-noise jitter out of ColorChange.
        let stats = ShapeStats {
            fill_ratio: 0.95,
            ..default_shape_stats()
        };
        let (ct, _) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.0005,
                max_delta: 0.001,
                delta_stddev: 0.0002,
            },
            &flat_gradient(),
            &stats,
            &square_bbox(),
            1.0,
        );
        assert_eq!(ct, ChangeType::ContentChange);
    }

    #[test]
    fn test_content_change_uncorrelated_edges() {
        // Both have edges but in different places → ContentChange
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.50,
                max_delta: 0.80,
                delta_stddev: 0.25,
            },
            &uncorrelated_edges(),
            &default_shape_stats(),
            &square_bbox(),
            0.0,
        );
        assert_eq!(ct, ChangeType::ContentChange);
        assert!(!signals.edges_correlated);
        assert_eq!(signals.confidence, 0.5);
    }

    #[test]
    fn test_tiny_region_high_color_not_noise() {
        let content = ContentEvidence {
            bg_distance_img1: 0.01,
            bg_distance_img2: 0.40,
        };
        let (ct, _) = classify_change_type(
            &content,
            &ColorDeltaStats {
                mean_delta: 0.50,
                max_delta: 0.50,
                delta_stddev: 0.02,
            },
            &img2_only_edges(),
            &default_shape_stats(),
            &BoundingBox {
                x: 50,
                y: 50,
                width: 1,
                height: 1,
            },
            0.0,
        );
        assert_eq!(ct, ChangeType::Addition);
    }
}
