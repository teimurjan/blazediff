use blazediff::interpret::types::{BoundingBox, ChangeRegion, ChangeType, ClassificationSignals};
use blazediff::types::Image;
use clap::ValueEnum;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "kebab-case")]
pub enum OutputFormat {
    Text,
    Json,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "kebab-case")]
pub enum EvaluationMode {
    ClassifierOnly,
    EndToEnd,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum DatasetTier {
    Gate,
    Regression,
    Stress,
}

impl std::fmt::Display for DatasetTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Gate => write!(f, "gate"),
            Self::Regression => write!(f, "regression"),
            Self::Stress => write!(f, "stress"),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct GroundTruthRegion {
    pub id: String,
    pub source_type: ChangeType,
    pub expected_type: ChangeType,
    pub bbox: BoundingBox,
    pub mask: Option<Vec<bool>>,
    pub pair_id: Option<String>,
    pub tags: Vec<String>,
    pub expect_in_output: bool,
}

pub struct ValidationCase {
    pub name: String,
    pub img1: Image,
    pub img2: Image,
    pub tier: DatasetTier,
    pub tags: Vec<String>,
    pub ground_truth: Vec<GroundTruthRegion>,
}

#[derive(Clone, Serialize)]
pub struct RegionMatch {
    pub gt_region_id: String,
    pub expected_type: ChangeType,
    pub predicted_type: ChangeType,
    pub source_type: ChangeType,
    pub iou: Option<f64>,
    pub gt_bbox: BoundingBox,
    pub predicted_bbox: Option<BoundingBox>,
    pub signals: Option<ClassificationSignals>,
    pub confidence: Option<f32>,
    pub pair_id: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
pub struct CaseResult {
    pub case_name: String,
    pub tier: DatasetTier,
    pub case_tags: Vec<String>,
    pub matches: Vec<RegionMatch>,
    pub unmatched_predictions: Vec<ChangeRegion>,
    pub unmatched_ground_truth: Vec<GroundTruthRegion>,
}

#[derive(Serialize)]
pub struct FailureDetail {
    pub case_name: String,
    pub tier: DatasetTier,
    pub failure_kind: String,
    pub gt_region_id: Option<String>,
    pub expected: Option<String>,
    pub predicted: Option<String>,
    pub pair_id: Option<String>,
    pub tags: Vec<String>,
    pub gt_bbox: Option<BoundingBox>,
    pub predicted_bbox: Option<BoundingBox>,
    pub iou: Option<f64>,
    pub signals: Option<ClassificationSignals>,
    pub confidence: Option<f32>,
}

#[derive(Serialize, Deserialize)]
pub struct BaselineReport {
    pub mode: EvaluationMode,
    pub macro_f1: f64,
    pub per_class: Vec<BaselineClassMetric>,
}

#[derive(Serialize, Deserialize)]
pub struct BaselineClassMetric {
    pub label: String,
    pub f1: f64,
}
