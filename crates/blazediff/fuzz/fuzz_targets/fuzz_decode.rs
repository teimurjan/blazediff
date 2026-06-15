#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    blazediff_fuzz::init();
    if data.len() > blazediff_fuzz::MAX_INPUT_LEN || !blazediff_fuzz::dims_within_budget(data) {
        return;
    }
    // No panic, no OOM, no timeout is the only assertion.
    let _ = blazediff::fast_png_io::decode(data);
});
