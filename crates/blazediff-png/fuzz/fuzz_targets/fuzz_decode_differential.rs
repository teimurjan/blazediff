#![no_main]
use libfuzzer_sys::fuzz_target;

fn snapshot(result: Result<blazediff_png::Image, blazediff_png::PngError>) -> Option<(u32, u32, Vec<u8>)> {
    result.ok().map(|i| (i.width, i.height, i.data))
}

fn snapshot_spng(
    result: Result<blazediff::Image, blazediff::DiffError>,
) -> Option<(u32, u32, Vec<u8>)> {
    result.ok().map(|i| (i.width, i.height, i.data))
}

// Full parity: blazediff_png and spng must agree on accept/reject for every
// input, and on every output byte when both accept — except for streams
// whose outcome depends on uninitialized memory. zlib 1.2.12 tolerates
// too-far-back distances at scanline gate boundaries and then copies from
// window memory beyond whave, so for such (intrinsically invalid) streams
// the decoded bytes — and therefore even filter-byte validation — are
// nondeterministic for spng and for us alike. Disagreements only count if
// both decoders are self-consistent under heap perturbation.
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.len() > blazediff_png_fuzz::MAX_INPUT_LEN
        || !blazediff_png_fuzz::dims_within_budget(data)
    {
        return;
    }
    let mine = snapshot(blazediff_png::decode(data));
    let oracle = snapshot_spng(blazediff::decode_spng_reference(data));
    if mine == oracle {
        return;
    }

    // Disagreement. Classify: if the strict-window reference (zlib-rs, which
    // deterministically rejects the too-far-distance streams classic zlib
    // tolerates) rejects this input *at the inflate level* while either
    // classic decoder accepted it, the acceptance — and every decoded byte —
    // depends on uninitialized window memory. No behavioral contract; skip.
    // Chunk-level strict errors don't qualify: that logic is shared with the
    // real decoder, so divergences there are real bugs.
    use blazediff_png::PngError;
    if matches!(
        blazediff_png::decode_strict_window(data),
        Err(PngError::IdatStream) | Err(PngError::IdatTooShort)
    ) && (mine.is_some() || oracle.is_some())
    {
        return;
    }

    // Belt and braces: re-dirty the heap and re-decode both sides; any
    // instability also marks the input as contract-free.
    for pattern in [0xAAu8, 0x55] {
        let scrub: Vec<Vec<u8>> = (0..8)
            .map(|i| vec![pattern; (1 << 15) + (i << 9)])
            .collect();
        std::hint::black_box(&scrub);
        drop(scrub);
        if snapshot(blazediff_png::decode(data)) != mine
            || snapshot_spng(blazediff::decode_spng_reference(data)) != oracle
        {
            return;
        }
    }

    match (mine, oracle) {
        (Some(m), Some(s)) => {
            assert_eq!((m.0, m.1), (s.0, s.1), "dimension mismatch");
            assert_eq!(m.2, s.2, "pixel mismatch");
        }
        (Some(m), None) => panic!("blazediff_png accepted ({}x{}) but spng rejected", m.0, m.1),
        (None, Some(s)) => {
            // Re-derive the error for the report.
            let err = blazediff_png::decode(data).err();
            panic!(
                "spng accepted ({}x{}) but blazediff_png rejected: {:?}",
                s.0, s.1, err
            );
        }
        (None, None) => unreachable!("equal verdicts handled above"),
    }
});
