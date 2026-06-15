#![no_main]
use blazediff_png::{decode_with, DecodeFormat, DecodeOptions, PngError};
use libfuzzer_sys::fuzz_target;

/// First input byte selects the output format (low 3 bits) and the decode
/// flags (tRNS / gamma / sBIT bits); the rest is the PNG stream.
fn pick(sel: u8) -> (DecodeOptions, i32, i32) {
    const FMTS: [(DecodeFormat, i32); 8] = [
        (DecodeFormat::Rgba8, 1),
        (DecodeFormat::Rgba16, 2),
        (DecodeFormat::Rgb8, 4),
        (DecodeFormat::Ga8, 16),
        (DecodeFormat::Ga16, 32),
        (DecodeFormat::G8, 64),
        (DecodeFormat::Png, 256),
        (DecodeFormat::Raw, 512),
    ];
    let (format, fmt_int) = FMTS[(sel & 7) as usize];
    let apply_trns = sel & 0x10 != 0;
    let apply_gamma = sel & 0x20 != 0;
    let apply_sbit = sel & 0x40 != 0;
    let mut flags = 0;
    if apply_trns {
        flags |= 1;
    }
    if apply_gamma {
        flags |= 2;
    }
    if apply_sbit {
        flags |= 8;
    }
    (
        DecodeOptions {
            format,
            apply_trns,
            apply_gamma,
            apply_sbit,
        },
        fmt_int,
        flags,
    )
}

fn snap_mine(r: Result<blazediff_png::Decoded, PngError>) -> Option<(u32, u32, Vec<u8>)> {
    r.ok().map(|d| (d.width, d.height, d.data))
}

fn snap_spng(
    r: Result<(u32, u32, u8, u8, Vec<u8>), blazediff::DiffError>,
) -> Option<(u32, u32, Vec<u8>)> {
    r.ok().map(|(w, h, _, _, d)| (w, h, d))
}

// Format-matrix parity: for every output format / flag combination,
// blazediff_png::decode_with must agree with spng's spng_decode_image on
// accept/reject and every output byte — modulo the uninitialized-window
// streams whose inflate outcome is nondeterministic (classified exactly as in
// fuzz_decode_differential; the inflate stage is format-independent).
fuzz_target!(|data: &[u8]| {
    blazediff_png_fuzz::init();
    if data.is_empty() {
        return;
    }
    let (opts, fmt_int, flags) = pick(data[0]);
    let png = &data[1..];
    if png.len() > blazediff_png_fuzz::MAX_INPUT_LEN || !blazediff_png_fuzz::dims_within_budget(png) {
        return;
    }

    let mine = snap_mine(decode_with(png, &opts));
    let oracle = snap_spng(blazediff::decode_spng_reference_fmt(png, fmt_int, flags));
    if mine == oracle {
        return;
    }

    if matches!(
        blazediff_png::decode_strict_window(png),
        Err(PngError::IdatStream) | Err(PngError::IdatTooShort)
    ) && (mine.is_some() || oracle.is_some())
    {
        return;
    }

    for pattern in [0xAAu8, 0x55] {
        let scrub: Vec<Vec<u8>> = (0..8).map(|i| vec![pattern; (1 << 15) + (i << 9)]).collect();
        std::hint::black_box(&scrub);
        drop(scrub);
        if snap_mine(decode_with(png, &opts)) != mine
            || snap_spng(blazediff::decode_spng_reference_fmt(png, fmt_int, flags)) != oracle
        {
            return;
        }
    }

    match (mine, oracle) {
        (Some(m), Some(s)) => {
            assert_eq!((m.0, m.1), (s.0, s.1), "{:?}: dimension mismatch", opts.format);
            assert_eq!(m.2, s.2, "{:?}: pixel mismatch", opts.format);
        }
        (Some(m), None) => panic!(
            "{:?}: blazediff_png accepts {}x{}, spng rejects",
            opts.format, m.0, m.1
        ),
        (None, Some(s)) => panic!(
            "{:?}: spng accepts {}x{}, blazediff_png rejects: {:?}",
            opts.format,
            s.0,
            s.1,
            decode_with(png, &opts).err()
        ),
        (None, None) => unreachable!("equal verdicts handled above"),
    }
});
