#![no_main]
use libfuzzer_sys::fuzz_target;

// Metadata parity: when blazediff_png and spng both fully decode an input,
// every ancillary chunk blazediff_png captures must equal what spng's
// `spng_get_*` getters return — field for field. Only compares when both
// decoders accept (spng_metadata returns None otherwise), so this never flags
// accept/reject disagreements (those are the decode target's job).
//
// libspng's spng_get_unknown_chunks returns only the first stored chunk, so we
// cap our unknown list to spng's; full passthrough is covered by the in-tree
// round-trip test.
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.len() > blazediff_png_fuzz::MAX_INPUT_LEN
        || !blazediff_png_fuzz::dims_within_budget(data)
    {
        return;
    }

    let Ok(ours) = blazediff_png::decode_with_metadata(data) else {
        return;
    };
    let Some(theirs) = blazediff_png_fuzz::spng_metadata(data) else {
        return;
    };

    let mut ours = ours.meta;
    ours.unknown.truncate(theirs.unknown.len());
    assert_eq!(ours, theirs, "metadata parity with spng");
});
