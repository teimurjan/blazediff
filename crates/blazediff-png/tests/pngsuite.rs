//! PngSuite conformance: decode parity with spng across Willem van Schaik's
//! canonical corpus — every format variant (basn*/basi*), odd sizes (s*),
//! filtering (f*), palettes (p*), ancillary chunks (c*/t*/g*), zlib levels
//! (z*), and the intentionally corrupt x* files where accept/reject must
//! match.

use blazediff_png::decode;

#[test]
fn pngsuite_parity_with_spng() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/pngsuite");
    let mut checked = 0;
    let mut accepted = 0;
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .expect("vendored pngsuite present")
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "png"))
        .collect();
    entries.sort();
    assert!(entries.len() >= 170, "expected the full PngSuite corpus");

    for path in entries {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let bytes = std::fs::read(&path).unwrap();
        let mine = decode(&bytes);
        let spng = blazediff::decode_spng_reference(&bytes).ok();
        match (&mine, &spng) {
            (Ok(m), Some(s)) => {
                assert_eq!(
                    (m.width, m.height),
                    (s.width, s.height),
                    "{name}: dimension mismatch"
                );
                assert_eq!(m.data, s.data, "{name}: pixel mismatch");
                accepted += 1;
            }
            (Err(_), None) => {}
            (Ok(_), None) => panic!("{name}: blazediff_png accepts, spng rejects"),
            (Err(e), Some(_)) => panic!("{name}: blazediff_png rejects ({e}), spng accepts"),
        }
        checked += 1;
    }
    println!("pngsuite: {checked} files, {accepted} decoded at parity");
    assert!(accepted >= 140, "most of the suite should decode");
}
