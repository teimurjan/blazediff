use super::content_analysis::{ContentEvidence, BG_BLEND_THRESHOLD};
use super::types::{
    BoundingBox, ChangeType, ClassificationSignals, ColorDeltaStats, GradientStats, ShapeStats,
};

pub fn classify_change_type(
    content: &ContentEvidence,
    color_delta: &ColorDeltaStats,
    gradient: &GradientStats,
    shape_stats: &ShapeStats,
    bbox: &BoundingBox,
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

    let mut signals = ClassificationSignals {
        blends_with_bg_in_img1: blends_bg1,
        blends_with_bg_in_img2: blends_bg2,
        low_color_delta,
        low_edge_change,
        dense_fill,
        sparse_fill,
        tiny_region,
        edges_correlated,
        confidence: 0.0,
    };

    // Rule 1: RenderingNoise — tiny regions with subtle color delta
    if tiny_region && low_color_delta {
        signals.confidence = 1.0;
        return (ChangeType::RenderingNoise, signals);
    }

    // Rule 2: RenderingNoise — sparse, subtle noise
    if sparse_fill && low_color_delta && low_edge_change {
        signals.confidence = matched_ratio(&[sparse_fill, low_color_delta, low_edge_change]);
        return (ChangeType::RenderingNoise, signals);
    }

    // Rule 3: Addition — blends with background in img1, distinct in img2
    if blends_bg1 && !blends_bg2 {
        // Boost: img2 gained edges that img1 didn't have
        let edge_boost = low_edge_change && !low_edge_img2;
        signals.confidence = if edge_boost { 1.0 } else { 0.9 };
        return (ChangeType::Addition, signals);
    }

    // Rule 4: Deletion — distinct in img1, blends with background in img2
    if !blends_bg1 && blends_bg2 {
        // Boost: img1 had edges that img2 lost
        let edge_boost = !low_edge_change && low_edge_img2;
        signals.confidence = if edge_boost { 1.0 } else { 0.9 };
        return (ChangeType::Deletion, signals);
    }

    // Rule 5: ColorChange — edges in both images agree spatially (structure preserved),
    // with meaningful and uniform color delta.
    // Low stddev = uniform shift (true recolor). High stddev = patchy (texture/content change).
    let uniform_delta = color_delta.delta_stddev < color_delta.mean_delta * 0.8 + 0.02;
    if edges_correlated && !low_color_delta && uniform_delta {
        signals.confidence = (color_delta.mean_delta * 5.0).min(1.0);
        return (ChangeType::ColorChange, signals);
    }

    // Rule 6: ContentChange — fallback
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
        );
        assert_eq!(ct, ChangeType::ColorChange);
    }

    #[test]
    fn test_low_edge_low_color_is_content_change() {
        // Both flat, low color delta → falls through to ContentChange
        let stats = ShapeStats {
            fill_ratio: 0.95,
            ..default_shape_stats()
        };
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats {
                mean_delta: 0.02,
                max_delta: 0.04,
                delta_stddev: 0.01,
            },
            &flat_gradient(),
            &stats,
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::ContentChange);
        assert_eq!(signals.confidence, 0.5);
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
        );
        assert_eq!(ct, ChangeType::Addition);
    }
}
