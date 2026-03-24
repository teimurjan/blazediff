use blazediff::interpret::interpret;
use blazediff::interpret::types::ChangeRegion;
use blazediff::types::DiffOptions;

use crate::matching::match_case;
use crate::types::{CaseResult, ValidationCase};

pub fn run_validation(
    cases: Vec<ValidationCase>,
    options: &DiffOptions,
    iou_threshold: f64,
    min_pixels: u32,
) -> Vec<CaseResult> {
    cases
        .iter()
        .map(|case| {
            let result = interpret(&case.img1, &case.img2, options)
                .unwrap_or_else(|e| panic!("interpret failed on case '{}': {e}", case.name));

            let regions: Vec<ChangeRegion> = if min_pixels > 0 {
                result
                    .regions
                    .into_iter()
                    .filter(|r| r.pixel_count >= min_pixels)
                    .collect()
            } else {
                result.regions
            };

            match_case(case, &regions, iou_threshold)
        })
        .collect()
}
