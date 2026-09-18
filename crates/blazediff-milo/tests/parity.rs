//! Proof that the port lands where the authors' PyTorch implementation does.
//!
//! `tests/fixtures/reference.json` holds what `MILO_runner.py` computes on a
//! CPU for seven fixture pairs from this repo and four small synthetic pairs
//! (see `scripts/export-reference.py` for how it was made). The synthetic
//! cases carry their full mask and error map, so every pixel of the pipeline
//! is checked, not just the pooled number; the fixtures check the pooled
//! numbers at real sizes, across every parity of width and height through
//! three halvings.
//!
//! Bit-exactness is not on the table: PyTorch sums each convolution in
//! whatever order oneDNN chooses, and the two disagree by a few ulps per
//! layer. Measured on NEON with fused multiply-add, the port lands within
//! 2e-6 relative on `raw_error`, 1.2e-6 absolute on `mos`, 1.4e-5 on any mask
//! value and 4e-6 on any error-map value. The bounds below sit well above
//! that, with room for the unfused SSE2 and wasm paths, so a real regression
//! (a tap read from the wrong row, a lambda off by one) fails by orders of
//! magnitude while summation-order noise never does.

use blazediff_milo::{milo, MiloOptions, Rgba8};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Relative bound on `raw_error` and absolute bound on `mos` for the fixtures.
const RAW_ERROR_REL: f64 = 1e-4;
const MOS_ABS: f64 = 5e-5;
/// Absolute bounds on the per-pixel mask and error map of the synthetic pairs.
const MASK_ABS: f32 = 5e-4;
const ERROR_MAP_ABS: f32 = 2e-4;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .expect("repo root")
}

fn reference() -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/reference.json");
    serde_json::from_str(&std::fs::read_to_string(&path).expect("reference.json")).expect("json")
}

fn load_rgba(path: &Path) -> (Vec<u8>, usize, usize) {
    let file = std::fs::File::open(path).unwrap_or_else(|e| panic!("open {path:?}: {e}"));
    let mut decoder = png::Decoder::new(std::io::BufReader::new(file));
    // Palettes expanded, 16-bit stripped: every fixture comes out 8-bit
    // gray, gray+alpha, RGB or RGBA, which is what PIL's `convert("RGBA")`
    // handed the reference.
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder
        .read_info()
        .unwrap_or_else(|e| panic!("png header {path:?}: {e}"));
    let mut data = vec![
        0u8;
        reader
            .output_buffer_size()
            .unwrap_or_else(|| panic!("png too large {path:?}"))
    ];
    let info = reader
        .next_frame(&mut data)
        .unwrap_or_else(|e| panic!("png frame {path:?}: {e}"));
    assert_eq!(info.bit_depth, png::BitDepth::Eight, "{path:?}");
    data.truncate(info.buffer_size());
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => data,
        png::ColorType::Rgb => data
            .chunks_exact(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => data
            .chunks_exact(2)
            .flat_map(|p| [p[0], p[0], p[0], p[1]])
            .collect(),
        png::ColorType::Grayscale => data.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        other => panic!("{path:?}: unexpected color type {other:?}"),
    };
    (rgba, info.width as usize, info.height as usize)
}

fn f64_of(value: &Value) -> f64 {
    value.as_f64().expect("number")
}

fn usize_of(value: &Value) -> usize {
    value.as_u64().expect("integer") as usize
}

fn f32s_of(value: &Value) -> Vec<f32> {
    value
        .as_array()
        .expect("array")
        .iter()
        .map(|v| f64_of(v) as f32)
        .collect()
}

/// RGB bytes from the JSON, widened to the RGBA8 the crate takes.
fn rgba_of(value: &Value) -> Vec<u8> {
    value
        .as_array()
        .expect("array")
        .chunks_exact(3)
        .flat_map(|rgb| {
            [
                rgb[0].as_u64().unwrap() as u8,
                rgb[1].as_u64().unwrap() as u8,
                rgb[2].as_u64().unwrap() as u8,
                255,
            ]
        })
        .collect()
}

fn max_abs_diff(actual: &[f32], expected: &[f32]) -> f32 {
    assert_eq!(actual.len(), expected.len());
    actual
        .iter()
        .zip(expected)
        .map(|(a, e)| (a - e).abs())
        .fold(0.0, f32::max)
}

#[test]
fn the_fixture_pairs_score_what_pytorch_scores() {
    let reference = reference();
    for case in reference["fixtures"].as_array().expect("fixtures") {
        let a = case["reference"].as_str().unwrap();
        let b = case["distorted"].as_str().unwrap();
        let (rgba1, w1, h1) = load_rgba(&repo_root().join("fixtures").join(a));
        let (rgba2, w2, h2) = load_rgba(&repo_root().join("fixtures").join(b));
        assert_eq!((w1, h1), (w2, h2));
        assert_eq!(
            (w1, h1),
            (usize_of(&case["width"]), usize_of(&case["height"]))
        );

        let outcome = milo(
            Rgba8::new(&rgba1, w1, h1),
            Rgba8::new(&rgba2, w2, h2),
            &MiloOptions::default(),
        )
        .unwrap();

        let expected_raw = f64_of(&case["raw_error"]);
        let expected_mos = f64_of(&case["mos"]);
        let raw_deviation = (outcome.raw_error - expected_raw).abs();
        let mos_deviation = (outcome.mos - expected_mos).abs();
        eprintln!(
            "{a} vs {b}: raw {:.9} (ref {:.9}, rel {:.2e}), mos {:.6} (ref {:.6}, abs {:.2e})",
            outcome.raw_error,
            expected_raw,
            raw_deviation / expected_raw.max(f64::MIN_POSITIVE),
            outcome.mos,
            expected_mos,
            mos_deviation
        );
        if expected_raw == 0.0 {
            assert_eq!(outcome.raw_error, 0.0, "{a} vs {b}");
        } else {
            assert!(
                raw_deviation <= expected_raw * RAW_ERROR_REL,
                "{a} vs {b}: raw {} vs {expected_raw}",
                outcome.raw_error
            );
        }
        assert!(
            mos_deviation <= MOS_ABS,
            "{a} vs {b}: mos {} vs {expected_mos}",
            outcome.mos
        );
    }
}

#[test]
fn the_synthetic_pairs_match_pixel_for_pixel() {
    let reference = reference();
    for case in reference["synthetic"].as_array().expect("synthetic") {
        let (width, height) = (usize_of(&case["width"]), usize_of(&case["height"]));
        let rgba1 = rgba_of(&case["reference"]);
        let rgba2 = rgba_of(&case["distorted"]);

        let outcome = milo(
            Rgba8::new(&rgba1, width, height),
            Rgba8::new(&rgba2, width, height),
            &MiloOptions::default(),
        )
        .unwrap();

        let mask_deviation = max_abs_diff(&outcome.mask, &f32s_of(&case["mask"]));
        let map_deviation = max_abs_diff(&outcome.error_map, &f32s_of(&case["error_map"]));
        let expected_raw = f64_of(&case["raw_error"]);
        let raw_deviation = (outcome.raw_error - expected_raw).abs();
        let mos_deviation = (outcome.mos - f64_of(&case["mos"])).abs();
        eprintln!(
            "synthetic {width}x{height}: mask {mask_deviation:.2e}, map {map_deviation:.2e}, raw rel {:.2e}, mos abs {mos_deviation:.2e}",
            raw_deviation / expected_raw
        );
        assert!(mask_deviation <= MASK_ABS, "{width}x{height} mask");
        assert!(map_deviation <= ERROR_MAP_ABS, "{width}x{height} error map");
        assert!(
            raw_deviation <= expected_raw * RAW_ERROR_REL,
            "{width}x{height} raw"
        );
        assert!(mos_deviation <= MOS_ABS, "{width}x{height} mos");
    }
}

#[test]
fn the_size_floor_is_the_references() {
    let reference = reference();
    assert_eq!(
        usize_of(&reference["smallest_side"]),
        blazediff_milo::MIN_SIDE
    );
}
