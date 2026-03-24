use std::collections::HashMap;
use std::path::Path;

use blazediff::interpret::types::{BoundingBox, ChangeType};
use blazediff::types::Image;
use serde::Deserialize;

use crate::types::{GroundTruthRegion, ValidationCase};

#[derive(Deserialize)]
struct Manifest {
    base_dir: String,
    #[serde(default)]
    type_mapping: HashMap<String, String>,
    cases: Vec<ManifestCase>,
}

#[derive(Deserialize)]
struct ManifestCase {
    name: String,
    img1: String,
    img2: String,
    regions: Vec<ManifestRegion>,
}

#[derive(Deserialize)]
struct ManifestRegion {
    change_type: String,
    bbox: ManifestBbox,
}

#[derive(Deserialize)]
struct ManifestBbox {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn parse_change_type(s: &str) -> Option<ChangeType> {
    match s {
        "Addition" => Some(ChangeType::Addition),
        "Deletion" => Some(ChangeType::Deletion),
        "Shift" => Some(ChangeType::Shift),
        "ColorChange" => Some(ChangeType::ColorChange),
        "ContentChange" => Some(ChangeType::ContentChange),
        "RenderingNoise" => Some(ChangeType::RenderingNoise),
        _ => None,
    }
}

fn load_image(path: &Path) -> Result<Image, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" => {
            blazediff::load_jpeg(path).map_err(|e| format!("load {}: {e}", path.display()))
        }
        _ => blazediff::load_png(path).map_err(|e| format!("load {}: {e}", path.display())),
    }
}

pub fn load_manifest(path: &str) -> Result<Vec<ValidationCase>, String> {
    let manifest_path = Path::new(path);
    let parent = manifest_path.parent().unwrap_or(Path::new("."));

    let content =
        std::fs::read_to_string(manifest_path).map_err(|e| format!("read manifest: {e}"))?;
    let manifest: Manifest =
        serde_json::from_str(&content).map_err(|e| format!("parse manifest: {e}"))?;

    let base = parent.join(&manifest.base_dir);
    let mut cases = Vec::new();
    let mut skipped = 0;

    for mc in &manifest.cases {
        let img1_path = base.join(&mc.img1);
        let img2_path = base.join(&mc.img2);

        let img1 = match load_image(&img1_path) {
            Ok(img) => img,
            Err(e) => {
                eprintln!("warning: {e}, skipping case '{}'", mc.name);
                skipped += 1;
                continue;
            }
        };
        let img2 = match load_image(&img2_path) {
            Ok(img) => img,
            Err(e) => {
                eprintln!("warning: {e}, skipping case '{}'", mc.name);
                skipped += 1;
                continue;
            }
        };

        if img1.width != img2.width || img1.height != img2.height {
            eprintln!(
                "warning: size mismatch in case '{}' ({}x{} vs {}x{}), skipping",
                mc.name, img1.width, img1.height, img2.width, img2.height
            );
            skipped += 1;
            continue;
        }

        let mut ground_truth = Vec::new();
        for mr in &mc.regions {
            let mapped_type_str = manifest
                .type_mapping
                .get(&mr.change_type)
                .map(|s| s.as_str())
                .unwrap_or(&mr.change_type);

            let Some(change_type) = parse_change_type(mapped_type_str) else {
                eprintln!(
                    "warning: unknown change type '{}' in case '{}', skipping region",
                    mr.change_type, mc.name
                );
                continue;
            };

            ground_truth.push(GroundTruthRegion {
                change_type,
                bbox: BoundingBox {
                    x: mr.bbox.x,
                    y: mr.bbox.y,
                    width: mr.bbox.width,
                    height: mr.bbox.height,
                },
            });
        }

        cases.push(ValidationCase {
            name: mc.name.clone(),
            img1,
            img2,
            ground_truth,
        });
    }

    if skipped > 0 {
        eprintln!("Skipped {skipped} cases due to errors");
    }

    Ok(cases)
}
