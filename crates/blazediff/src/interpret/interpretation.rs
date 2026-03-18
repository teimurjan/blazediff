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
    let tiny_region = bbox_area <= 9;
    let low_color_delta = color_delta.mean_delta < 0.05;
    let low_edge_change = gradient.edge_score < 0.05;
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
        signals.confidence = 1.0;
        return (ChangeType::Addition, signals);
    }

    // Rule 4: Deletion — distinct in img1, blends with background in img2
    if !blends_bg1 && blends_bg2 {
        signals.confidence = 1.0;
        return (ChangeType::Deletion, signals);
    }

    // Rule 5: ColorChange — structure preserved (low edge change), regardless of color magnitude.
    // Sparse+subtle cases are already caught as RenderingNoise by Rule 2.
    if low_edge_change {
        signals.confidence = if low_color_delta { 0.75 } else { 1.0 };
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
        BoundingBox { x: 0, y: 0, width: 100, height: 100 }
    }

    fn blends_both() -> ContentEvidence {
        ContentEvidence { bg_distance_img1: 0.01, bg_distance_img2: 0.01 }
    }

    fn no_blends() -> ContentEvidence {
        ContentEvidence { bg_distance_img1: 0.50, bg_distance_img2: 0.50 }
    }

    #[test]
    fn test_rendering_noise_tiny() {
        let (ct, signals) = classify_change_type(
            &blends_both(),
            &ColorDeltaStats { mean_delta: 0.01, max_delta: 0.02 },
            &GradientStats { edge_score: 1.0 },
            &default_shape_stats(),
            &BoundingBox { x: 50, y: 50, width: 1, height: 1 },
        );
        assert_eq!(ct, ChangeType::RenderingNoise);
        assert!(signals.tiny_region);
        assert_eq!(signals.confidence, 1.0);
    }

    #[test]
    fn test_rendering_noise_sparse() {
        let stats = ShapeStats { fill_ratio: 0.10, ..default_shape_stats() };
        let (ct, signals) = classify_change_type(
            &blends_both(),
            &ColorDeltaStats { mean_delta: 0.02, max_delta: 0.04 },
            &GradientStats { edge_score: 0.01 },
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
        // Blends with bg in img1 (was background), distinct in img2 (content appeared)
        let content = ContentEvidence { bg_distance_img1: 0.02, bg_distance_img2: 0.40 };
        let (ct, signals) = classify_change_type(
            &content,
            &ColorDeltaStats { mean_delta: 0.30, max_delta: 0.50 },
            &GradientStats { edge_score: 0.10 },
            &default_shape_stats(),
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::Addition);
        assert!(signals.blends_with_bg_in_img1);
        assert!(!signals.blends_with_bg_in_img2);
    }

    #[test]
    fn test_deletion() {
        // Distinct in img1 (had content), blends with bg in img2 (content removed)
        let content = ContentEvidence { bg_distance_img1: 0.40, bg_distance_img2: 0.02 };
        let (ct, signals) = classify_change_type(
            &content,
            &ColorDeltaStats { mean_delta: 0.30, max_delta: 0.50 },
            &GradientStats { edge_score: 0.10 },
            &default_shape_stats(),
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::Deletion);
        assert!(!signals.blends_with_bg_in_img1);
        assert!(signals.blends_with_bg_in_img2);
    }

    #[test]
    fn test_color_change() {
        // Both have content, low edge (no structural change), moderate color delta
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats { mean_delta: 0.20, max_delta: 0.30 },
            &GradientStats { edge_score: 0.01 },
            &default_shape_stats(),
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::ColorChange);
        assert_eq!(signals.confidence, 1.0);
    }

    #[test]
    fn test_color_change_subtle() {
        // Dense region with low edge AND low color delta → still ColorChange (not ContentChange)
        let stats = ShapeStats { fill_ratio: 0.95, ..default_shape_stats() };
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats { mean_delta: 0.02, max_delta: 0.04 },
            &GradientStats { edge_score: 0.03 },
            &stats,
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::ColorChange);
        assert_eq!(signals.confidence, 0.75);
    }

    #[test]
    fn test_content_change_fallback() {
        // Both have content, high edge + high color → ContentChange
        let (ct, signals) = classify_change_type(
            &no_blends(),
            &ColorDeltaStats { mean_delta: 0.50, max_delta: 0.80 },
            &GradientStats { edge_score: 0.30 },
            &default_shape_stats(),
            &square_bbox(),
        );
        assert_eq!(ct, ChangeType::ContentChange);
        assert_eq!(signals.confidence, 0.5);
    }

    #[test]
    fn test_tiny_region_high_color_not_noise() {
        // Tiny but high color delta — skips noise rule, classifies by content
        let content = ContentEvidence { bg_distance_img1: 0.01, bg_distance_img2: 0.40 };
        let (ct, _) = classify_change_type(
            &content,
            &ColorDeltaStats { mean_delta: 0.50, max_delta: 0.50 },
            &GradientStats { edge_score: 1.0 },
            &default_shape_stats(),
            &BoundingBox { x: 50, y: 50, width: 1, height: 1 },
        );
        assert_eq!(ct, ChangeType::Addition);
    }

}
