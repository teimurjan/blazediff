use std::collections::BTreeMap;

use super::types::{ChangeRegion, ChangeSeverity, ChangeType, SpatialPosition};

pub fn build_summary(
    regions: &[ChangeRegion],
    severity: &ChangeSeverity,
    diff_percentage: f64,
) -> String {
    let region_word = if regions.len() == 1 {
        "region"
    } else {
        "regions"
    };
    let severity_label = match severity {
        ChangeSeverity::Low => "Low-impact",
        ChangeSeverity::Medium => "Moderate",
        ChangeSeverity::High => "Significant",
    };

    let mut lines = vec![format!(
        "{severity_label} visual change detected ({diff_percentage:.2}% of image, {count} {region_word}).",
        count = regions.len(),
    )];

    // Group by change type, preserving order of first occurrence via BTreeMap on discriminant
    let mut groups: BTreeMap<u8, (ChangeType, usize, Vec<SpatialPosition>)> = BTreeMap::new();
    let type_order = |ct: &ChangeType| -> u8 {
        match ct {
            ChangeType::ContentChange => 0,
            ChangeType::Addition => 1,
            ChangeType::Deletion => 2,
            ChangeType::Shift => 3,
            ChangeType::ColorChange => 4,
            ChangeType::RenderingNoise => 5,
        }
    };

    for r in regions {
        let key = type_order(&r.change_type);
        let entry = groups
            .entry(key)
            .or_insert_with(|| (r.change_type, 0, Vec::new()));
        entry.1 += 1;
        if !entry.2.contains(&r.position) {
            entry.2.push(r.position);
        }
    }

    for (_, (change_type, count, positions)) in &groups {
        let label = match change_type {
            ChangeType::ContentChange => "Content changed",
            ChangeType::Addition => "Content added",
            ChangeType::Deletion => "Content removed",
            ChangeType::Shift => "Content shifted",
            ChangeType::ColorChange => "Colors changed",
            ChangeType::RenderingNoise => "Rendering noise",
        };
        let rw = if *count == 1 { "region" } else { "regions" };
        let pos_str: Vec<String> = positions.iter().map(|p| p.to_string()).collect();
        lines.push(format!("{label}: {count} {rw} ({}).", pos_str.join(", ")));
    }

    lines.join("\n")
}
