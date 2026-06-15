#![no_main]
use blazediff_png::{
    decode_with, encode16, ColorMode, DecodeFormat, DecodeOptions, EncodeOptions, Filter, Image16,
};
use libfuzzer_sys::fuzz_target;

// True-16-bit encode round-trip: encode16 must produce a PNG that both our own
// RGBA16 decode and spng's SPNG_FMT_RGBA16 decode read back as the exact
// source samples, across every filter / compression / interlace combination.
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.len() < 5 {
        return;
    }
    let w = (data[0] as u32 % 24) + 1;
    let h = (data[1] as u32 % 24) + 1;
    let n = (w * h) as usize;
    let filter = match data[2] % 6 {
        0 => Filter::None,
        1 => Filter::Sub,
        2 => Filter::Up,
        3 => Filter::Average,
        4 => Filter::Paeth,
        _ => Filter::Adaptive,
    };
    let compression = data[3] % 13;
    let interlace = data[4] & 1 != 0;

    let body = &data[5..];
    if body.is_empty() {
        return;
    }
    // RGBA16 host-order samples sourced from the fuzz body (cycled).
    let mut pix = Vec::with_capacity(n * 4);
    for i in 0..n * 4 {
        let lo = body[(2 * i) % body.len()];
        let hi = body[(2 * i + 1) % body.len()];
        pix.push(u16::from_le_bytes([lo, hi]));
    }
    let img = Image16 {
        data: pix,
        width: w,
        height: h,
    };
    let opts = EncodeOptions {
        color: ColorMode::Rgba16,
        compression,
        filter,
        interlace,
    };
    let png = match encode16(&img, &opts) {
        Ok(p) => p,
        Err(_) => return,
    };

    let d = decode_with(
        &png,
        &DecodeOptions {
            format: DecodeFormat::Rgba16,
            ..Default::default()
        },
    )
    .expect("our RGBA16 decode of our own output");
    let got: Vec<u16> = d
        .data
        .chunks_exact(2)
        .map(|b| u16::from_ne_bytes([b[0], b[1]]))
        .collect();
    assert_eq!(got, img.data, "self round-trip mismatch");

    let (_, _, _, _, sb) =
        blazediff::decode_spng_reference_fmt(&png, 2, 0).expect("spng RGBA16 decode of our output");
    let sgot: Vec<u16> = sb
        .chunks_exact(2)
        .map(|b| u16::from_ne_bytes([b[0], b[1]]))
        .collect();
    assert_eq!(sgot, img.data, "spng round-trip mismatch");
});
