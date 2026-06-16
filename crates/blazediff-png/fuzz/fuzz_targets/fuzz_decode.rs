#![no_main]
use libfuzzer_sys::fuzz_target;

// decode() must never panic, hang, or OOM on arbitrary input.
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.len() > blazediff_png_fuzz::MAX_INPUT_LEN
        || !blazediff_png_fuzz::dims_within_budget(data)
    {
        return;
    }
    let _ = blazediff_png::decode(data);
});
