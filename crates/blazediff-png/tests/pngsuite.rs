//! PngSuite conformance across Willem van Schaik's canonical corpus: every
//! format variant (basn*/basi*), odd sizes (s*), filtering (f*), palettes
//! (p*), ancillary chunks (c*/t*/g*) and zlib levels (z*) must decode
//! identically through blazediff_png, spng and image-rs (Rule A). The
//! intentionally corrupt x* files must reject in lockstep with spng (Rule B).

mod common;

use common::{assert_chunk_parity, assert_valid};

#[test]
fn pngsuite_conformance() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/pngsuite");
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .expect("vendored pngsuite present")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "png"))
        .collect();
    entries.sort();
    assert!(entries.len() >= 170, "expected the full PngSuite corpus");

    let mut valid = 0;
    for path in &entries {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let bytes = std::fs::read(path).unwrap();
        if name.starts_with('x') {
            assert_chunk_parity(&bytes, &name);
        } else {
            assert_valid(&bytes, &name);
            valid += 1;
        }
    }
    println!("pngsuite: {} files, {valid} valid", entries.len());
    assert!(valid >= 140, "most of the suite should be valid");
}
