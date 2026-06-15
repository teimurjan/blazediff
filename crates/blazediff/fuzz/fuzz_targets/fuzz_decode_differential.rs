#![no_main]
use libfuzzer_sys::fuzz_target;

// The fast path may reject anything (the caller falls back to spng), but it
// must never disagree with spng on what it accepts.
fuzz_target!(|data: &[u8]| {
    blazediff_fuzz::init();
    if data.len() > blazediff_fuzz::MAX_INPUT_LEN || !blazediff_fuzz::dims_within_budget(data) {
        return;
    }
    let Some(fast) = blazediff::fast_png_io::decode(data) else {
        return;
    };
    let oracle = blazediff::decode_spng_reference(data).unwrap_or_else(|e| {
        panic!(
            "fast_png_io accepted ({}x{}) but spng rejected: {:?}",
            fast.width, fast.height, e
        )
    });
    assert_eq!(
        (fast.width, fast.height),
        (oracle.width, oracle.height),
        "dimension mismatch"
    );
    assert_eq!(fast.data, oracle.data, "pixel mismatch");
});
