use blazediff::interpret::types::{BoundingBox, ChangeRegion, ChangeType};
use blazediff::types::Image;
use serde::Serialize;

pub struct GroundTruthRegion {
    pub change_type: ChangeType,
    pub bbox: BoundingBox,
}

pub struct ValidationCase {
    pub name: String,
    pub img1: Image,
    pub img2: Image,
    pub ground_truth: Vec<GroundTruthRegion>,
}

pub struct RegionMatch {
    pub ground_truth_type: ChangeType,
    pub predicted_type: ChangeType,
    pub iou: f64,
}

pub struct CaseResult {
    pub case_name: String,
    pub matches: Vec<RegionMatch>,
    pub unmatched_predictions: Vec<ChangeRegion>,
    pub unmatched_ground_truth: Vec<GroundTruthRegion>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
pub enum OutputFormat {
    Text,
    Json,
}
