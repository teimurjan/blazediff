//! Proof that the Rust SSIM metrics land where MATLAB does.
//!
//! `packages/ssim` validates its TypeScript against the reference MATLAB
//! scripts in `packages/ssim/matlab` by shelling out to Octave; this is the
//! Rust half of the same proof, run against the same fixtures with the same
//! tolerances, so the port cannot quietly drift away from the reference.
//!
//! Needs Octave on `PATH` (`brew install octave`). Without it the tests report
//! a skip, unless `BLAZEDIFF_REQUIRE_OCTAVE=1` is set — CI that means to prove
//! parity should set it so a missing Octave fails loudly instead of passing
//! vacuously.

use blazediff_ssim::{
    hitchhikers_ssim, ms_ssim, ssim, HitchhikersOptions, MsSsimOptions, Plane, Rgba8, SsimOptions,
};
use std::path::{Path, PathBuf};
use std::process::Command;

/// Fixture stems under `fixtures/blazediff`, paired as `<stem>a` / `<stem>b`,
/// with the largest relative difference from MATLAB each pair is allowed.
///
/// Pairs 1-3 carry the exact ceilings `packages/ssim` asserts (0.01% for the
/// first two, 0.05% where downsampling by 5 costs the most precision). Pair 4
/// is not in the JS suite and gets a bound fitted to its measured 0.005%.
const PAIRS: [(&str, f64); 4] = [("1", 0.01), ("2", 0.01), ("3", 0.05), ("4", 0.01)];

/// MATLAB's `msssim.m` pools `'valid'`-mode per-scale statistics while both
/// ports pool symmetric `'same'`-mode ones, so the two disagree by an
/// algorithmic margin rather than a numerical one. `packages/ssim` pins that
/// margin at one decimal place; so does this.
const MS_SSIM_MAX_ABSOLUTE: f64 = 0.05;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .expect("repo root")
}

fn fixture(name: &str) -> PathBuf {
    repo_root().join("fixtures/blazediff").join(name)
}

fn matlab_dir() -> PathBuf {
    repo_root().join("packages/ssim/matlab")
}

/// `Some(())` when Octave can run, `None` when the caller should skip.
fn require_octave() -> Option<()> {
    let available = Command::new("octave")
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false);

    if available {
        return Some(());
    }
    assert!(
        std::env::var("BLAZEDIFF_REQUIRE_OCTAVE").is_err(),
        "BLAZEDIFF_REQUIRE_OCTAVE is set but octave is not on PATH"
    );
    eprintln!("skipping: octave not on PATH (install it to prove MATLAB parity)");
    None
}

/// Run one of the reference `.m` functions over a fixture pair, the same way
/// `packages/ssim`'s vitest suite does.
fn run_octave(function: &str, image1: &Path, image2: &Path) -> f64 {
    let script = [
        format!("addpath('{}')", escape(&matlab_dir())),
        format!("img1 = imread('{}')", escape(image1)),
        format!("img2 = imread('{}')", escape(image2)),
        "if size(img1, 3) == 3, img1 = rgb2gray(img1); end".to_string(),
        "if size(img2, 3) == 3, img2 = rgb2gray(img2); end".to_string(),
        format!("result = {function}(double(img1), double(img2))"),
        "fprintf('%.15f', result)".to_string(),
    ]
    .join("; ");

    let output = Command::new("octave")
        .arg("--eval")
        .arg(&script)
        .output()
        .expect("failed to run octave");
    assert!(
        output.status.success(),
        "octave failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_score(&stdout)
        .unwrap_or_else(|| panic!("no number in octave output for {function}: {stdout:?}"))
}

fn escape(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

fn parse_score(output: &str) -> Option<f64> {
    output
        .split(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-'))
        .filter(|token| token.contains('.'))
        .find_map(|token| token.parse::<f64>().ok())
}

/// Decode a fixture to RGBA8.
///
/// Deliberately the third-party `png` crate rather than `blazediff-png`: this
/// test exists to catch SSIM drift, and an in-repo decoder would let a decoder
/// regression masquerade as one. Every fixture is 8-bit RGBA, asserted below so
/// a re-encoded one fails loudly instead of silently changing the inputs.
fn load_rgba(path: &Path) -> (Vec<u8>, usize, usize) {
    let file = std::fs::File::open(path).unwrap_or_else(|e| panic!("open {path:?}: {e}"));
    let mut reader = png::Decoder::new(std::io::BufReader::new(file))
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
    assert_eq!(info.color_type, png::ColorType::Rgba, "{path:?}");
    assert_eq!(info.bit_depth, png::BitDepth::Eight, "{path:?}");
    data.truncate(info.buffer_size());
    (data, info.width as usize, info.height as usize)
}

fn plane(name: &str) -> Plane {
    let (data, width, height) = load_rgba(&fixture(name));
    Plane::from_rgba8(Rgba8::new(&data, width, height))
        .unwrap_or_else(|e| panic!("plane {name}: {e}"))
}

#[test]
fn ssim_matches_matlab() {
    if require_octave().is_none() {
        return;
    }

    for (stem, max_percent) in PAIRS {
        let (name1, name2) = (format!("{stem}a.png"), format!("{stem}b.png"));
        let ours = ssim(&plane(&name1), &plane(&name2), &SsimOptions::default())
            .expect("ssim")
            .score;
        let matlab = run_octave("ssim", &fixture(&name1), &fixture(&name2));

        let difference = (ours - matlab).abs();
        let percent = difference / matlab * 100.0;
        println!("{stem}a vs {stem}b  rust {ours:.12}  matlab {matlab:.12}  Δ {difference:.12} ({percent:.4}%)");

        assert!(
            percent < max_percent,
            "{stem}: {ours} vs MATLAB {matlab} is {percent:.4}% off, over the {max_percent}% budget"
        );
    }
}

#[test]
fn ssim_matches_matlab_exactly_on_identical_images() {
    if require_octave().is_none() {
        return;
    }

    let image = plane("1a.png");
    let ours = ssim(&image, &image, &SsimOptions::default())
        .expect("ssim")
        .score;
    let matlab = run_octave("ssim", &fixture("1a.png"), &fixture("1a.png"));

    assert_eq!(ours, 1.0, "identical images must score exactly 1.0");
    assert_eq!(matlab, 1.0, "MATLAB scores identical images exactly 1.0");
}

#[test]
fn ms_ssim_matches_matlab() {
    if require_octave().is_none() {
        return;
    }

    for (stem, _) in PAIRS {
        let (name1, name2) = (format!("{stem}a.png"), format!("{stem}b.png"));
        let ours = ms_ssim(
            &plane(&name1),
            &plane(&name2),
            &SsimOptions::default(),
            &MsSsimOptions::default(),
        )
        .expect("ms-ssim")
        .score;
        let matlab = run_octave("msssim", &fixture(&name1), &fixture(&name2));

        let difference = (ours - matlab).abs();
        println!("{stem}a vs {stem}b  rust {ours:.12}  matlab {matlab:.12}  Δ {difference:.12}");

        assert!(
            difference < MS_SSIM_MAX_ABSOLUTE,
            "{stem}: {ours} vs MATLAB {matlab} differs by {difference}"
        );
    }
}

/// Scores `packages/ssim` produces for the same fixtures, in the order
/// `(ssim, ms-ssim, hitchhikers CoV-pooled, hitchhikers mean-pooled)`.
///
/// Regenerate by calling the four TypeScript entry points over
/// `fixtures/blazediff/<stem>{a,b}.png` and printing `toFixed(12)`. Changing a
/// number here without a matching change in `packages/ssim` means the two
/// implementations have drifted apart.
const TYPESCRIPT_SCORES: [(&str, [f64; 4]); 4] = [
    (
        "1",
        [
            0.997876122792,
            0.994884487808,
            0.959658363397,
            0.997598367043,
        ],
    ),
    (
        "2",
        [
            0.959473282935,
            0.946226983746,
            0.796208921742,
            0.964701905209,
        ],
    ),
    (
        "3",
        [
            0.963859894896,
            0.968022696899,
            0.832281917971,
            0.968665632075,
        ],
    ),
    (
        "4",
        [
            0.972896865505,
            0.975835085284,
            0.878642166629,
            0.985355147171,
        ],
    ),
];

/// Widest gap allowed between the two ports. The measured worst case is 3e-7,
/// which is float noise from `f32` accumulation and the FMA the JS engine does
/// not have; anything larger is an algorithmic divergence, not rounding.
const PORT_TOLERANCE: f64 = 5e-6;

/// Hold the Rust port against `packages/ssim` directly.
///
/// The Octave tests above cover SSIM and MS-SSIM. Hitchhiker's SSIM has no
/// MATLAB reference — box windows and coefficient-of-variation pooling are not
/// what `ssim.m` computes — so its proof runs through the TypeScript, which
/// carries its own validation suite. Needs no Octave.
#[test]
fn matches_the_typescript_port() {
    for (stem, expected) in TYPESCRIPT_SCORES {
        let (image1, image2) = (
            plane(&format!("{stem}a.png")),
            plane(&format!("{stem}b.png")),
        );
        let options = SsimOptions::default();

        let actual = [
            ssim(&image1, &image2, &options).expect("ssim").score,
            ms_ssim(&image1, &image2, &options, &MsSsimOptions::default())
                .expect("ms-ssim")
                .score,
            hitchhikers_ssim(&image1, &image2, &options, &HitchhikersOptions::default())
                .expect("hitchhikers")
                .score,
            hitchhikers_ssim(
                &image1,
                &image2,
                &options,
                &HitchhikersOptions {
                    cov_pooling: false,
                    ..Default::default()
                },
            )
            .expect("hitchhikers")
            .score,
        ];

        for (metric, (ours, theirs)) in actual.iter().zip(expected).enumerate() {
            let difference = (ours - theirs).abs();
            println!("{stem} metric {metric}: rust {ours:.12} ts {theirs:.12} Δ {difference:.3e}");
            assert!(
                difference < PORT_TOLERANCE,
                "{stem} metric {metric}: rust {ours} vs typescript {theirs} differ by {difference:e}"
            );
        }
    }
}
