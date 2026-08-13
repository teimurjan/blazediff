//! Loading a subjective-quality dataset: image pairs plus the human score.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// One rated distorted image and the reference it came from.
pub struct Sample {
    pub reference: PathBuf,
    pub distorted: PathBuf,
    /// Mean opinion score. Higher is better quality, always — [`load_kadid10k`]
    /// verifies that against the dataset's own distortion levels rather than
    /// trusting the column name.
    pub mos: f64,
    /// Distortion type id, 1-based.
    pub distortion: u32,
    /// Distortion level, 1 (mildest) to 5 (severest).
    pub level: u32,
    /// Held-out split, derived from the *reference* image so that no reference
    /// appears in both folds. Tuning on one fold and reporting on the other is
    /// what keeps a configuration search from turning into overfitting.
    pub fold: u32,
}

pub struct Dataset {
    pub name: String,
    pub samples: Vec<Sample>,
    /// Human-readable label per distortion id, when the dataset ships them.
    pub distortion_names: BTreeMap<u32, String>,
}

impl Dataset {
    pub fn label(&self, distortion: u32) -> String {
        match self.distortion_names.get(&distortion) {
            Some(name) => format!("{distortion:02} {name}"),
            None => format!("{distortion:02}"),
        }
    }

    /// Distortion ids present, ascending.
    pub fn distortions(&self) -> Vec<u32> {
        let mut ids: Vec<u32> = self.samples.iter().map(|s| s.distortion).collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    }
}

/// Load KADID-10k from a directory holding `dmos.csv` and `images/`.
///
/// 81 references x 25 distortions x 5 levels. Filenames encode the triple as
/// `I<ref>_<distortion>_<level>.png`, which is where the per-distortion
/// breakdown and the polarity check come from.
pub fn load_kadid10k(root: &Path) -> Result<Dataset, String> {
    let csv_path = root.join("dmos.csv");
    let text =
        std::fs::read_to_string(&csv_path).map_err(|e| format!("{}: {e}", csv_path.display()))?;
    let images = root.join("images");

    let mut lines = text.lines();
    let header = lines.next().ok_or("dmos.csv is empty")?;
    let columns: Vec<&str> = header
        .split(',')
        .map(|c| c.trim().trim_matches('"'))
        .collect();
    let find = |name: &str| {
        columns
            .iter()
            .position(|c| c.eq_ignore_ascii_case(name))
            .ok_or_else(|| format!("dmos.csv has no '{name}' column; saw {columns:?}"))
    };
    // The score column is named `dmos` in the distributed CSV even though the
    // values are on KADID's 1-5 MOS scale; the polarity check below is what
    // actually settles which way it runs.
    let (dist_col, ref_col, score_col) = (find("dist_img")?, find("ref_img")?, find("dmos")?);

    let mut samples = Vec::new();
    for (number, line) in lines.enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = line
            .split(',')
            .map(|f| f.trim().trim_matches('"'))
            .collect();
        let widest = dist_col.max(ref_col).max(score_col);
        if fields.len() <= widest {
            return Err(format!(
                "dmos.csv line {}: only {} fields",
                number + 2,
                fields.len()
            ));
        }
        let distorted_name = fields[dist_col];
        let (distortion, level) = parse_distortion(distorted_name).ok_or_else(|| {
            format!(
                "dmos.csv line {}: cannot parse '{distorted_name}'",
                number + 2
            )
        })?;
        let mos: f64 = fields[score_col]
            .parse()
            .map_err(|e| format!("dmos.csv line {}: bad score: {e}", number + 2))?;

        let reference_name = fields[ref_col];
        samples.push(Sample {
            reference: images.join(reference_name),
            distorted: images.join(distorted_name),
            mos,
            distortion,
            level,
            fold: reference_index(reference_name).unwrap_or(0) % 2,
        });
    }

    if samples.is_empty() {
        return Err("dmos.csv has no rows".to_string());
    }
    verify_polarity(&samples)?;

    Ok(Dataset {
        name: "KADID-10k".to_string(),
        samples,
        distortion_names: BTreeMap::new(),
    })
}

/// `I23.png` -> `23`, the number the fold split keys on.
fn reference_index(filename: &str) -> Option<u32> {
    let stem = filename.strip_suffix(".png").unwrap_or(filename);
    stem.strip_prefix('I')?.parse().ok()
}

/// `I23_07_04.png` -> `(7, 4)`.
fn parse_distortion(filename: &str) -> Option<(u32, u32)> {
    let stem = filename.strip_suffix(".png").unwrap_or(filename);
    let mut parts = stem.split('_');
    parts.next()?; // reference id
    let distortion = parts.next()?.parse().ok()?;
    let level = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((distortion, level))
}

/// Confirm higher really does mean better, using the dataset's own severity
/// ladder: level 5 is the worst distortion of each type, so it must average a
/// lower score than level 1. Guessing this wrong silently flips the sign of
/// every correlation in the report.
fn verify_polarity(samples: &[Sample]) -> Result<(), String> {
    let mean_at = |level: u32| {
        let scores: Vec<f64> = samples
            .iter()
            .filter(|s| s.level == level)
            .map(|s| s.mos)
            .collect();
        if scores.is_empty() {
            None
        } else {
            Some(scores.iter().sum::<f64>() / scores.len() as f64)
        }
    };
    let (Some(mildest), Some(severest)) = (mean_at(1), mean_at(5)) else {
        return Err("dataset has no level-1 or level-5 samples to check polarity with".to_string());
    };
    if mildest <= severest {
        return Err(format!(
            "score polarity looks inverted: level 1 averages {mildest:.3} and level 5 \
             averages {severest:.3}, but milder distortion should score higher. \
             The harness assumes higher = better quality."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filenames_decode_to_distortion_and_level() {
        assert_eq!(parse_distortion("I23_07_04.png"), Some((7, 4)));
        assert_eq!(parse_distortion("I01_01_01.png"), Some((1, 1)));
        assert_eq!(parse_distortion("I81_25_05.png"), Some((25, 5)));
        assert_eq!(parse_distortion("I01.png"), None);
        assert_eq!(parse_distortion("I01_02_03_04.png"), None);
    }

    fn sample(level: u32, mos: f64) -> Sample {
        Sample {
            reference: PathBuf::new(),
            distorted: PathBuf::new(),
            mos,
            distortion: 1,
            level,
            fold: 0,
        }
    }

    #[test]
    fn references_split_into_two_folds_by_index() {
        assert_eq!(reference_index("I23.png"), Some(23));
        assert_eq!(reference_index("I01.png"), Some(1));
        assert_eq!(reference_index("nope.png"), None);
    }

    #[test]
    fn polarity_passes_when_milder_distortion_scores_higher() {
        let samples = vec![sample(1, 4.5), sample(5, 1.2)];
        assert!(verify_polarity(&samples).is_ok());
    }

    #[test]
    fn polarity_is_rejected_when_the_scale_runs_the_other_way() {
        let samples = vec![sample(1, 1.2), sample(5, 4.5)];
        let error = verify_polarity(&samples).unwrap_err();
        assert!(error.contains("inverted"), "{error}");
    }
}
