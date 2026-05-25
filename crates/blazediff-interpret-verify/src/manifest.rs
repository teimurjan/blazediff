use std::collections::HashMap;
use std::path::Path;

use blazediff::interpret::types::{BoundingBox, ChangeType};
use blazediff::types::Image;
use serde::Deserialize;

use crate::types::{DatasetTier, GroundTruthRegion, ValidationCase};

#[derive(Deserialize)]
struct Manifest {
    base_dir: String,
    #[serde(default)]
    type_mapping: HashMap<String, String>,
    #[serde(default = "default_tier")]
    default_tier: DatasetTier,
    cases: Vec<ManifestCase>,
}

#[derive(Deserialize)]
struct ManifestCase {
    name: String,
    img1: String,
    img2: String,
    #[serde(default)]
    tier: Option<DatasetTier>,
    #[serde(default)]
    tags: Vec<String>,
    regions: Vec<ManifestRegion>,
}

#[derive(Deserialize)]
struct ManifestRegion {
    #[serde(default)]
    id: Option<String>,
    change_type: String,
    #[serde(default)]
    expected_change_type: Option<String>,
    #[serde(default)]
    bbox: Option<ManifestBbox>,
    #[serde(default)]
    mask_path: Option<String>,
    #[serde(default)]
    pair_id: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default = "default_expect_in_output")]
    expect_in_output: bool,
}

#[derive(Clone, Copy, Deserialize)]
struct ManifestBbox {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn default_tier() -> DatasetTier {
    DatasetTier::Gate
}

fn default_expect_in_output() -> bool {
    true
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

fn bbox_from_manifest(bbox: ManifestBbox) -> BoundingBox {
    BoundingBox {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
    }
}

fn load_mask(path: &Path, width: u32, height: u32) -> Result<Vec<bool>, String> {
    let image = load_image(path)?;
    if image.width != width || image.height != height {
        return Err(format!(
            "mask {} has size {}x{}, expected {}x{}",
            path.display(),
            image.width,
            image.height,
            width,
            height
        ));
    }

    let mut mask = vec![false; (width * height) as usize];
    for (idx, px) in image.data.chunks_exact(4).enumerate() {
        mask[idx] = px[0] > 0 || px[1] > 0 || px[2] > 0 || px[3] > 0;
    }
    if !mask.iter().any(|&v| v) {
        return Err(format!("mask {} is empty", path.display()));
    }
    Ok(mask)
}

fn bbox_from_mask(mask: &[bool], width: u32, height: u32) -> Result<BoundingBox, String> {
    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..height {
        for x in 0..width {
            if mask[(y * width + x) as usize] {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                found = true;
            }
        }
    }

    if !found {
        return Err("mask had no positive pixels".to_string());
    }

    Ok(BoundingBox {
        x: min_x,
        y: min_y,
        width: max_x - min_x + 1,
        height: max_y - min_y + 1,
    })
}

fn resolve_change_type(
    manifest: &Manifest,
    value: &str,
    field_name: &str,
    case_name: &str,
    region_id: &str,
) -> Result<ChangeType, String> {
    let mapped = manifest
        .type_mapping
        .get(value)
        .map(|s| s.as_str())
        .unwrap_or(value);
    parse_change_type(mapped).ok_or_else(|| {
        format!("unknown {field_name} '{value}' in case '{case_name}', region '{region_id}'")
    })
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

    for mc in &manifest.cases {
        let img1_path = base.join(&mc.img1);
        let img2_path = base.join(&mc.img2);

        let img1 = load_image(&img1_path)?;
        let img2 = load_image(&img2_path)?;

        if img1.width != img2.width || img1.height != img2.height {
            return Err(format!(
                "size mismatch in case '{}' ({}x{} vs {}x{})",
                mc.name, img1.width, img1.height, img2.width, img2.height
            ));
        }

        let mut ground_truth = Vec::new();
        for (index, mr) in mc.regions.iter().enumerate() {
            let region_id = mr
                .id
                .clone()
                .unwrap_or_else(|| format!("{}-region-{}", mc.name, index + 1));
            let source_type = resolve_change_type(
                &manifest,
                &mr.change_type,
                "change_type",
                &mc.name,
                &region_id,
            )?;
            let expected_type = resolve_change_type(
                &manifest,
                mr.expected_change_type
                    .as_deref()
                    .unwrap_or(&mr.change_type),
                "expected_change_type",
                &mc.name,
                &region_id,
            )?;

            let mask = match &mr.mask_path {
                Some(mask_path) => Some(load_mask(&base.join(mask_path), img1.width, img1.height)?),
                None => None,
            };
            let bbox = match (mr.bbox, mask.as_ref()) {
                (Some(bbox), _) => bbox_from_manifest(bbox),
                (None, Some(mask)) => bbox_from_mask(mask, img1.width, img1.height)?,
                (None, None) => {
                    return Err(format!(
                        "case '{}' region '{}' needs either bbox or mask_path",
                        mc.name, region_id
                    ));
                }
            };

            ground_truth.push(GroundTruthRegion {
                id: region_id,
                source_type,
                expected_type,
                bbox,
                mask,
                pair_id: mr.pair_id.clone(),
                tags: mr.tags.clone(),
                expect_in_output: mr.expect_in_output,
            });
        }

        if ground_truth.is_empty() {
            return Err(format!(
                "case '{}' has no ground-truth regions after parsing",
                mc.name
            ));
        }

        cases.push(ValidationCase {
            name: mc.name.clone(),
            img1,
            img2,
            tier: mc.tier.unwrap_or(manifest.default_tier),
            tags: mc.tags.clone(),
            ground_truth,
        });
    }

    Ok(cases)
}

#[cfg(test)]
mod tests {
    use super::*;
    use blazediff::save_png;
    use blazediff::types::Image;

    fn make_mask_image(width: u32, height: u32, coords: &[(u32, u32)]) -> Image {
        let mut img = Image::new(width, height);
        for &(x, y) in coords {
            let pos = ((y * width + x) * 4) as usize;
            img.data[pos] = 255;
            img.data[pos + 1] = 255;
            img.data[pos + 2] = 255;
            img.data[pos + 3] = 255;
        }
        img
    }

    #[test]
    fn parses_mask_backed_shift_regions() {
        let base = std::env::temp_dir().join(format!(
            "blazediff-interpret-verify-manifest-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let img = Image::new(8, 8);
        save_png(&img, base.join("before.png")).unwrap();
        save_png(&img, base.join("after.png")).unwrap();
        save_png(
            &make_mask_image(8, 8, &[(1, 1), (1, 2), (2, 1), (2, 2)]),
            base.join("mask_a.png"),
        )
        .unwrap();
        save_png(
            &make_mask_image(8, 8, &[(5, 5), (5, 6), (6, 5), (6, 6)]),
            base.join("mask_b.png"),
        )
        .unwrap();

        let manifest_path = base.join("manifest.json");
        std::fs::write(
            &manifest_path,
            r#"{
  "base_dir": ".",
  "default_tier": "gate",
  "cases": [
    {
      "name": "shift_case",
      "regions": [
        {
          "id": "gone",
          "change_type": "Deletion",
          "expected_change_type": "Shift",
          "mask_path": "mask_a.png",
          "pair_id": "pair-1"
        },
        {
          "id": "arrived",
          "change_type": "Addition",
          "expected_change_type": "Shift",
          "mask_path": "mask_b.png",
          "pair_id": "pair-1"
        }
      ],
      "img1": "before.png",
      "img2": "after.png"
    }
  ]
}"#,
        )
        .unwrap();

        let cases = load_manifest(manifest_path.to_str().unwrap()).unwrap();
        assert_eq!(cases.len(), 1);
        assert_eq!(cases[0].ground_truth.len(), 2);
        assert_eq!(cases[0].ground_truth[0].expected_type, ChangeType::Shift);
        assert_eq!(cases[0].ground_truth[0].bbox.width, 2);
        assert_eq!(cases[0].ground_truth[1].bbox.x, 5);
    }

    #[test]
    fn rejects_empty_ground_truth_case() {
        let base = std::env::temp_dir().join(format!(
            "blazediff-interpret-verify-empty-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&base).unwrap();

        let img = Image::new(4, 4);
        save_png(&img, base.join("a.png")).unwrap();
        save_png(&img, base.join("b.png")).unwrap();

        let manifest_path = std::path::PathBuf::from(&base).join("manifest.json");
        std::fs::write(
            &manifest_path,
            r#"{
  "base_dir": ".",
  "cases": [
    {
      "name": "bad",
      "img1": "a.png",
      "img2": "b.png",
      "regions": []
    }
  ]
}"#,
        )
        .unwrap();

        let err = load_manifest(manifest_path.to_str().unwrap())
            .err()
            .unwrap();
        assert!(err.contains("no ground-truth regions"));
    }
}
