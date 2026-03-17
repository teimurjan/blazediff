use crate::types::{BoundingBox, SpatialPosition};

/// Classify the spatial position of a bounding box within a 3x3 grid.
/// Uses the center point of the bbox to determine which cell it falls into.
pub fn classify_position(bbox: &BoundingBox, image_width: u32, image_height: u32) -> SpatialPosition {
    let center_x = bbox.x as f64 + bbox.width as f64 / 2.0;
    let center_y = bbox.y as f64 + bbox.height as f64 / 2.0;

    let third_w = image_width as f64 / 3.0;
    let third_h = image_height as f64 / 3.0;

    let col = if center_x < third_w {
        0
    } else if center_x < third_w * 2.0 {
        1
    } else {
        2
    };

    let row = if center_y < third_h {
        0
    } else if center_y < third_h * 2.0 {
        1
    } else {
        2
    };

    match (row, col) {
        (0, 0) => SpatialPosition::TopLeft,
        (0, 1) => SpatialPosition::Top,
        (0, 2) => SpatialPosition::TopRight,
        (1, 0) => SpatialPosition::Left,
        (1, 1) => SpatialPosition::Center,
        (1, 2) => SpatialPosition::Right,
        (2, 0) => SpatialPosition::BottomLeft,
        (2, 1) => SpatialPosition::Bottom,
        (2, 2) => SpatialPosition::BottomRight,
        _ => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_center() {
        let bbox = BoundingBox { x: 40, y: 40, width: 20, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::Center);
    }

    #[test]
    fn test_classify_top_left() {
        let bbox = BoundingBox { x: 0, y: 0, width: 10, height: 10 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::TopLeft);
    }

    #[test]
    fn test_classify_bottom_right() {
        let bbox = BoundingBox { x: 80, y: 80, width: 20, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::BottomRight);
    }

    #[test]
    fn test_classify_top() {
        let bbox = BoundingBox { x: 40, y: 0, width: 20, height: 10 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::Top);
    }

    #[test]
    fn test_classify_left() {
        let bbox = BoundingBox { x: 0, y: 40, width: 10, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::Left);
    }

    #[test]
    fn test_classify_right() {
        let bbox = BoundingBox { x: 80, y: 40, width: 20, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::Right);
    }

    #[test]
    fn test_classify_bottom_left() {
        let bbox = BoundingBox { x: 0, y: 80, width: 10, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::BottomLeft);
    }

    #[test]
    fn test_classify_bottom() {
        let bbox = BoundingBox { x: 40, y: 80, width: 20, height: 20 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::Bottom);
    }

    #[test]
    fn test_classify_top_right() {
        let bbox = BoundingBox { x: 80, y: 0, width: 20, height: 10 };
        assert_eq!(classify_position(&bbox, 100, 100), SpatialPosition::TopRight);
    }
}
