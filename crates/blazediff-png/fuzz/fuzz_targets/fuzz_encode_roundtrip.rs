#![no_main]
use blazediff_png::{ColorMode, EncodeOptions, Filter, FilterSet, Image};
use libfuzzer_sys::fuzz_target;

// Derive encode options + a mode-representable image from fuzz bytes, then
// require decode(encode(img)) == img AND spng cross-decode == img.
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.len() < 8 {
        return;
    }

    let width = 1 + (data[0] as u32 % 64);
    let height = 1 + (data[1] as u32 % 64);
    let mode = match data[2] % 16 {
        0 => ColorMode::Auto,
        1 => ColorMode::Gray1,
        2 => ColorMode::Gray2,
        3 => ColorMode::Gray4,
        4 => ColorMode::Gray8,
        5 => ColorMode::Gray16,
        6 => ColorMode::GrayAlpha8,
        7 => ColorMode::GrayAlpha16,
        8 => ColorMode::Indexed1,
        9 => ColorMode::Indexed2,
        10 => ColorMode::Indexed4,
        11 => ColorMode::Indexed8,
        12 => ColorMode::Rgb8,
        13 => ColorMode::Rgb16,
        14 => ColorMode::Rgba8,
        _ => ColorMode::Rgba16,
    };
    let filter = match data[3] % 7 {
        0 => Filter::None,
        1 => Filter::Sub,
        2 => Filter::Up,
        3 => Filter::Average,
        4 => Filter::Paeth,
        5 => Filter::Adaptive,
        // Arbitrary non-empty filter subset (SPNG_IMG_FILTER_CHOICE). Bit k of
        // data[6] enables filter k; OR in NONE so the set is never empty.
        _ => {
            let bits = data[6];
            let mut set = FilterSet::NONE;
            for (bit, f) in [
                FilterSet::SUB,
                FilterSet::UP,
                FilterSet::AVERAGE,
                FilterSet::PAETH,
            ]
            .into_iter()
            .enumerate()
            {
                if bits & (1 << bit) != 0 {
                    set = set | f;
                }
            }
            Filter::Choice(set)
        }
    };
    let options = EncodeOptions {
        color: mode,
        compression: data[4] % 13,
        filter,
        interlace: data[5] & 1 == 1,
    };

    // Fill pixels from the remaining bytes (cycled), coerced into the
    // requested mode's representable set.
    let pixels = &data[6..];
    let n = (width * height) as usize;
    let mut img = Image {
        data: vec![0u8; n * 4],
        width,
        height,
    };
    for (i, px) in img.data.chunks_exact_mut(4).enumerate() {
        let b = |k: usize| pixels[(i * 4 + k) % pixels.len()];
        let (rgb, a) = match mode {
            ColorMode::Gray1 => ([if b(0) & 1 == 0 { 0 } else { 255 }; 3], 255),
            ColorMode::Gray2 => ([(b(0) % 4) * 85; 3], 255),
            ColorMode::Gray4 => ([(b(0) % 16) * 17; 3], 255),
            ColorMode::Gray8 | ColorMode::Gray16 => ([b(0); 3], 255),
            ColorMode::GrayAlpha8 | ColorMode::GrayAlpha16 => ([b(0); 3], b(3)),
            ColorMode::Indexed1 => ([if b(0) & 1 == 0 { 9 } else { 200 }; 3], 255),
            ColorMode::Indexed2 => ([(b(0) % 4) * 60; 3], 255),
            ColorMode::Indexed4 => {
                let v = b(0) % 16;
                ([v * 3, v * 5, v * 7], 255)
            }
            ColorMode::Indexed8 => {
                let v = b(0);
                ([v, v ^ 0x3C, v ^ 0xC3], if v & 1 == 0 { 255 } else { 77 })
            }
            ColorMode::Rgb8 | ColorMode::Rgb16 => ([b(0), b(1), b(2)], 255),
            _ => ([b(0), b(1), b(2)], b(3)),
        };
        px[..3].copy_from_slice(&rgb);
        px[3] = a;
    }

    let png = blazediff_png::encode(&img, &options).expect("representable by construction");
    let back = blazediff_png::decode(&png).expect("own output must decode");
    assert_eq!((back.width, back.height), (width, height));
    assert_eq!(back.data, img.data, "round-trip mismatch");

    let spng = blazediff::decode_spng_reference(&png).expect("spng must accept our output");
    assert_eq!(spng.data, img.data, "spng cross-decode mismatch");
});
