use super::types::{BoundingBox, ChangeShape, ShapeStats};

pub fn compute_shape_stats(
    mask: &[bool],
    width: u32,
    bbox: &BoundingBox,
    pixel_count: u32,
) -> ShapeStats {
    let bbox_area = (bbox.width as u64) * (bbox.height as u64);
    if bbox_area == 0 || pixel_count == 0 {
        return ShapeStats {
            fill_ratio: 0.0,
            border_ratio: 0.0,
            inner_fill_ratio: 0.0,
            center_density: 0.0,
            row_occupancy: 0.0,
            col_occupancy: 0.0,
        };
    }

    let fill_ratio = pixel_count as f64 / bbox_area as f64;

    let border_band = (bbox.width.min(bbox.height) / 4).min(12).max(1);
    let mut border_count: u32 = 0;
    let mut inner_count: u32 = 0;
    let mut rows_hit = vec![false; bbox.height as usize];
    let mut cols_hit = vec![false; bbox.width as usize];

    // Center quadrant bounds (middle 50% of bbox)
    let center_x0 = bbox.width / 4;
    let center_x1 = bbox.width - bbox.width / 4;
    let center_y0 = bbox.height / 4;
    let center_y1 = bbox.height - bbox.height / 4;
    let center_area = ((center_x1 - center_x0) as u64) * ((center_y1 - center_y0) as u64);
    let mut center_count: u32 = 0;

    for dy in 0..bbox.height {
        let y = bbox.y + dy;
        for dx in 0..bbox.width {
            let x = bbox.x + dx;
            let idx = (y * width + x) as usize;
            if !mask[idx] {
                continue;
            }
            rows_hit[dy as usize] = true;
            cols_hit[dx as usize] = true;

            let in_border = dx < border_band
                || dx >= bbox.width - border_band
                || dy < border_band
                || dy >= bbox.height - border_band;
            if in_border {
                border_count += 1;
            } else {
                inner_count += 1;
            }

            if dx >= center_x0 && dx < center_x1 && dy >= center_y0 && dy < center_y1 {
                center_count += 1;
            }
        }
    }

    let border_ratio = border_count as f64 / pixel_count as f64;

    // Inner fill = changed pixels in interior / total interior area
    let inner_area = bbox_area.saturating_sub(
        (bbox.width as u64) * (border_band as u64) * 2
            + (bbox.height.saturating_sub(border_band * 2) as u64) * (border_band as u64) * 2,
    );
    let inner_fill_ratio = if inner_area > 0 {
        inner_count as f64 / inner_area as f64
    } else {
        fill_ratio // bbox too small for meaningful interior
    };

    let center_density = if center_area > 0 {
        center_count as f64 / center_area as f64
    } else {
        fill_ratio
    };

    let row_occupancy = rows_hit.iter().filter(|&&v| v).count() as f64 / bbox.height as f64;
    let col_occupancy = cols_hit.iter().filter(|&&v| v).count() as f64 / bbox.width as f64;

    ShapeStats {
        fill_ratio,
        border_ratio,
        inner_fill_ratio,
        center_density,
        row_occupancy,
        col_occupancy,
    }
}

pub fn classify_shape(stats: &ShapeStats) -> ChangeShape {
    if stats.fill_ratio > 0.65 {
        return ChangeShape::SolidRegion;
    }

    // ContourFrame: changes concentrate on edges, interior/center mostly empty
    if stats.inner_fill_ratio < 0.20
        && (stats.border_ratio > 0.60
            || (stats.center_density < 0.10
                && stats.border_ratio > 0.30
                && stats.fill_ratio < 0.50))
    {
        return ChangeShape::ContourFrame;
    }

    if stats.fill_ratio < 0.30 && stats.border_ratio > 0.45 {
        return ChangeShape::EdgeDominated;
    }

    if stats.fill_ratio < 0.30 && stats.row_occupancy > 0.7 && stats.col_occupancy > 0.7 {
        return ChangeShape::SparseDistributed;
    }

    ChangeShape::MixedRegion
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solid_block() {
        let mask = vec![true; 100]; // 10x10 all true
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let stats = compute_shape_stats(&mask, 10, &bbox, 100);

        assert!((stats.fill_ratio - 1.0).abs() < f64::EPSILON);
        assert!((stats.row_occupancy - 1.0).abs() < f64::EPSILON);
        assert!((stats.col_occupancy - 1.0).abs() < f64::EPSILON);
        assert!(stats.inner_fill_ratio > 0.9);
        assert!(stats.center_density > 0.9);
        assert_eq!(classify_shape(&stats), ChangeShape::SolidRegion);
    }

    #[test]
    fn test_hollow_rectangle() {
        // 20x20 grid, only border pixels (1px band) are true
        let width: u32 = 20;
        let height: u32 = 20;
        let mut mask = vec![false; (width * height) as usize];
        let mut pixel_count: u32 = 0;

        for y in 0..height {
            for x in 0..width {
                if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
                    mask[(y * width + x) as usize] = true;
                    pixel_count += 1;
                }
            }
        }

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_shape_stats(&mask, width, &bbox, pixel_count);

        assert!(stats.fill_ratio < 0.30);
        assert!(stats.border_ratio > 0.45);
        assert!(stats.inner_fill_ratio < 0.05);
        assert_eq!(classify_shape(&stats), ChangeShape::ContourFrame);
    }

    #[test]
    fn test_thick_hollow_frame() {
        // 40x40 grid, 4px border band filled, interior empty
        let width: u32 = 40;
        let height: u32 = 40;
        let mut mask = vec![false; (width * height) as usize];
        let mut pixel_count: u32 = 0;

        for y in 0..height {
            for x in 0..width {
                if x < 4 || x >= width - 4 || y < 4 || y >= height - 4 {
                    mask[(y * width + x) as usize] = true;
                    pixel_count += 1;
                }
            }
        }

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_shape_stats(&mask, width, &bbox, pixel_count);

        assert!(stats.inner_fill_ratio < 0.05);
        assert!(stats.center_density < 0.05);
        assert_eq!(classify_shape(&stats), ChangeShape::ContourFrame);
    }

    #[test]
    fn test_scattered_pixels() {
        // 100x100 grid, one pixel per row at column = row index
        let width: u32 = 100;
        let height: u32 = 100;
        let mut mask = vec![false; (width * height) as usize];
        let mut pixel_count: u32 = 0;

        for y in 0..height {
            let x = y % width;
            mask[(y * width + x) as usize] = true;
            pixel_count += 1;
        }

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_shape_stats(&mask, width, &bbox, pixel_count);

        assert!(stats.fill_ratio < 0.30);
        assert!((stats.row_occupancy - 1.0).abs() < f64::EPSILON);
        assert!((stats.col_occupancy - 1.0).abs() < f64::EPSILON);
        assert_eq!(classify_shape(&stats), ChangeShape::SparseDistributed);
    }

    #[test]
    fn test_center_density_concentrated() {
        // 20x20 grid, only center 10x10 filled
        let width: u32 = 20;
        let height: u32 = 20;
        let mut mask = vec![false; (width * height) as usize];
        let mut pixel_count: u32 = 0;

        for y in 5..15 {
            for x in 5..15 {
                mask[(y * width + x) as usize] = true;
                pixel_count += 1;
            }
        }

        let bbox = BoundingBox {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        let stats = compute_shape_stats(&mask, width, &bbox, pixel_count);

        assert!(stats.center_density > 0.8);
        assert_eq!(classify_shape(&stats), ChangeShape::SolidRegion);
    }

    #[test]
    fn test_hollow_frame_empty_center() {
        // Simulates the real-world case: 21% fill, 15% inner fill, 0% center density
        // Changes spread across rows/cols but concentrated on periphery
        let width: u32 = 100;
        let height: u32 = 100;
        let mut mask = vec![false; (width * height) as usize];
        let mut pixel_count: u32 = 0;

        // Fill edges with sparse pattern (every 5th pixel on the border band)
        for y in 0..height {
            for x in 0..width {
                let on_outer = x < 15 || x >= width - 15 || y < 15 || y >= height - 15;
                if on_outer && (x + y) % 5 == 0 {
                    mask[(y * width + x) as usize] = true;
                    pixel_count += 1;
                }
            }
        }

        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width,
            height,
        };
        let stats = compute_shape_stats(&mask, width, &bbox, pixel_count);

        assert!(stats.center_density < 0.10);
        assert!(stats.inner_fill_ratio < 0.20);
        assert_eq!(classify_shape(&stats), ChangeShape::ContourFrame);
    }

    #[test]
    fn test_empty_bbox() {
        let mask = vec![false; 100];
        let bbox = BoundingBox {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let stats = compute_shape_stats(&mask, 10, &bbox, 0);

        assert!((stats.fill_ratio).abs() < f64::EPSILON);
        assert!((stats.border_ratio).abs() < f64::EPSILON);
        assert!((stats.inner_fill_ratio).abs() < f64::EPSILON);
        assert!((stats.center_density).abs() < f64::EPSILON);
        assert!((stats.row_occupancy).abs() < f64::EPSILON);
        assert!((stats.col_occupancy).abs() < f64::EPSILON);
    }
}
