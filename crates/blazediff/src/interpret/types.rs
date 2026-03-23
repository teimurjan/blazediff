use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InterpretResult {
    pub summary: String,
    pub diff_count: u32,
    pub total_regions: usize,
    pub regions: Vec<ChangeRegion>,
    pub severity: ChangeSeverity,
    pub diff_percentage: f64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChangeRegion {
    pub bbox: BoundingBox,
    pub pixel_count: u32,
    pub percentage: f64,
    pub position: SpatialPosition,
    pub shape: ChangeShape,
    pub shape_stats: ShapeStats,
    pub change_type: ChangeType,
    pub signals: ClassificationSignals,
    pub confidence: f32,
    pub color_delta: ColorDeltaStats,
    pub gradient: GradientStats,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChangeType {
    RenderingNoise,
    ContentChange,
    Addition,
    Deletion,
    Shift,
    ColorChange,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct ClassificationSignals {
    pub blends_with_bg_in_img1: bool,
    pub blends_with_bg_in_img2: bool,
    pub low_color_delta: bool,
    pub low_edge_change: bool,
    pub dense_fill: bool,
    pub sparse_fill: bool,
    pub tiny_region: bool,
    pub edges_correlated: bool,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct ColorDeltaStats {
    pub mean_delta: f32,
    pub max_delta: f32,
    /// Standard deviation of per-pixel color deltas (normalized).
    /// Low = uniform shift (ColorChange), high = patchy (ContentChange).
    pub delta_stddev: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct GradientStats {
    pub edge_score: f32,
    pub edge_score_img2: f32,
    pub edge_correlation: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct ShapeStats {
    pub fill_ratio: f64,
    pub border_ratio: f64,
    pub inner_fill_ratio: f64,
    pub center_density: f64,
    pub row_occupancy: f64,
    pub col_occupancy: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChangeShape {
    SolidRegion,
    ContourFrame,
    SparseDistributed,
    EdgeDominated,
    MixedRegion,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct BoundingBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

impl BoundingBox {
    /// Expand the bounding box to include pixel (px, py).
    pub fn expand(&mut self, px: u32, py: u32) {
        let right = self.x + self.width;
        let bottom = self.y + self.height;
        if px < self.x {
            self.width += self.x - px;
            self.x = px;
        }
        if py < self.y {
            self.height += self.y - py;
            self.y = py;
        }
        if px + 1 > right {
            self.width = px + 1 - self.x;
        }
        if py + 1 > bottom {
            self.height = py + 1 - self.y;
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChangeSeverity {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SpatialPosition {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
}

impl std::fmt::Display for SpatialPosition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TopLeft => write!(f, "top-left"),
            Self::Top => write!(f, "top"),
            Self::TopRight => write!(f, "top-right"),
            Self::Left => write!(f, "left"),
            Self::Center => write!(f, "center"),
            Self::Right => write!(f, "right"),
            Self::BottomLeft => write!(f, "bottom-left"),
            Self::Bottom => write!(f, "bottom"),
            Self::BottomRight => write!(f, "bottom-right"),
        }
    }
}

impl std::fmt::Display for ChangeShape {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SolidRegion => write!(f, "solid-region"),
            Self::ContourFrame => write!(f, "contour-frame"),
            Self::SparseDistributed => write!(f, "sparse-distributed"),
            Self::EdgeDominated => write!(f, "edge-dominated"),
            Self::MixedRegion => write!(f, "mixed-region"),
        }
    }
}

impl std::fmt::Display for ChangeSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Low => write!(f, "low"),
            Self::Medium => write!(f, "medium"),
            Self::High => write!(f, "high"),
        }
    }
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RenderingNoise => write!(f, "rendering-noise"),
            Self::ContentChange => write!(f, "content-change"),
            Self::Addition => write!(f, "addition"),
            Self::Deletion => write!(f, "deletion"),
            Self::Shift => write!(f, "shift"),
            Self::ColorChange => write!(f, "color-change"),
        }
    }
}
