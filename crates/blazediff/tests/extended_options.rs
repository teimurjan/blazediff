//! `color_space`, `ignore_mask` and `window_size` against pixelmatch 8 and
//! against the default YIQ path.

use blazediff::{diff, load_png, ColorSpace, DiffError, DiffOptions, Image};
use std::path::PathBuf;

fn fixture(name: &str) -> (Image, Image) {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    let a = load_png(dir.join(format!("{name}a.png"))).unwrap();
    let b = load_png(dir.join(format!("{name}b.png"))).unwrap();
    (a, b)
}

/// Every 7th pixel ignored, the same mask the JS suite uses.
fn stripe_mask(image: &Image) -> Vec<u8> {
    (0..image.width * image.height)
        .map(|i| u8::from(i % 7 == 0))
        .collect()
}

/// pixelmatch 8.0.0 counts for: defaults, includeAA, threshold 0.05,
/// windowSize 16, stripe mask, stripe mask + windowSize 8 + includeAA.
const PIXELMATCH_8: [(&str, [u32; 6]); 12] = [
    ("pixelmatch/1", [121, 187, 152, 118, 104, 41]),
    ("pixelmatch/2", [10424, 10756, 12821, 256, 8934, 55]),
    ("pixelmatch/3", [200, 366, 220, 47, 177, 32]),
    ("pixelmatch/4", [7616, 11078, 36563, 69, 6507, 25]),
    ("pixelmatch/5", [0, 229, 0, 0, 0, 7]),
    ("pixelmatch/6", [38, 4610, 51, 10, 30, 23]),
    ("pixelmatch/7", [2440, 2728, 3032, 164, 2089, 55]),
    ("blazediff/1", [624, 784, 624, 256, 535, 55]),
    ("blazediff/2", [8742, 9412, 8742, 256, 7501, 55]),
    ("blazediff/3", [24817, 32939, 30965, 246, 21268, 55]),
    ("blazediff/4", [20343, 26582, 20358, 200, 17435, 55]),
    ("alpha/1", [53, 567, 64, 12, 49, 16]),
];

#[test]
fn oklab_matches_pixelmatch_8() {
    for (name, expected) in PIXELMATCH_8 {
        let (a, b) = fixture(name);
        let oklab = DiffOptions {
            color_space: ColorSpace::Oklab,
            ..Default::default()
        };
        let cases = [
            oklab.clone(),
            DiffOptions {
                include_aa: true,
                ..oklab.clone()
            },
            DiffOptions {
                threshold: 0.05,
                ..oklab.clone()
            },
            DiffOptions {
                window_size: Some(16),
                ..oklab.clone()
            },
            DiffOptions {
                ignore_mask: Some(stripe_mask(&a)),
                ..oklab.clone()
            },
            DiffOptions {
                ignore_mask: Some(stripe_mask(&a)),
                window_size: Some(8),
                include_aa: true,
                ..oklab.clone()
            },
        ];
        for (case, (options, want)) in cases.iter().zip(expected).enumerate() {
            let counted = diff(&a, &b, None, options).unwrap().diff_count;
            assert_eq!(counted, want, "{name} case {case} without output");
            let mut output = Image::new(a.width, a.height);
            let drawn = diff(&a, &b, Some(&mut output), options).unwrap().diff_count;
            assert_eq!(drawn, want, "{name} case {case} with output");
        }
    }
}

#[test]
fn all_zero_mask_keeps_the_default_yiq_result() {
    for (name, _) in PIXELMATCH_8 {
        let (a, b) = fixture(name);
        for base in [
            DiffOptions::default(),
            DiffOptions {
                include_aa: true,
                ..Default::default()
            },
            DiffOptions {
                diff_mask: true,
                ..Default::default()
            },
        ] {
            let masked = DiffOptions {
                ignore_mask: Some(vec![0; (a.width * a.height) as usize]),
                ..base.clone()
            };
            let mut plain_out = Image::new(a.width, a.height);
            let mut masked_out = Image::new(a.width, a.height);
            let plain = diff(&a, &b, Some(&mut plain_out), &base).unwrap();
            let with_mask = diff(&a, &b, Some(&mut masked_out), &masked).unwrap();
            assert_eq!(with_mask.diff_count, plain.diff_count, "{name}");
            if !plain.identical {
                assert!(masked_out.data == plain_out.data, "{name} output differs");
            }
            assert_eq!(
                diff(&a, &b, None, &masked).unwrap().diff_count,
                plain.diff_count,
                "{name}"
            );
        }
    }
}

/// Counted diff pixels as a 0/1 map, read from a diff_mask render.
fn counted_map(a: &Image, b: &Image, options: &DiffOptions) -> Vec<u8> {
    let mut output = Image::new(a.width, a.height);
    let render = DiffOptions {
        diff_mask: true,
        diff_color: [255, 0, 0],
        diff_color_alt: None,
        aa_color: [0, 0, 255],
        ignore_mask: None,
        window_size: None,
        ..options.clone()
    };
    diff(a, b, Some(&mut output), &render).unwrap();
    output
        .as_u32()
        .iter()
        .map(|&pixel| u8::from(pixel == 0xFF00_00FF))
        .collect()
}

fn brute_window_max(map: &[u8], width: u32, height: u32, n: u32) -> u32 {
    let (w, h, n) = (width as usize, height as usize, n as usize);
    let mut best = 0;
    for y in 0..=h - n {
        for x in 0..=w - n {
            let count: u32 = (y..y + n)
                .map(|row| {
                    map[row * w + x..row * w + x + n]
                        .iter()
                        .map(|&v| u32::from(v))
                        .sum::<u32>()
                })
                .sum();
            best = best.max(count);
        }
    }
    best
}

#[test]
fn window_size_matches_a_brute_force_maximum() {
    let (a, b) = fixture("pixelmatch/3");
    for color_space in [ColorSpace::Yiq, ColorSpace::Oklab] {
        let options = DiffOptions {
            color_space,
            ..Default::default()
        };
        let map = counted_map(&a, &b, &options);
        for n in [1, 4, 16, 64] {
            let windowed = DiffOptions {
                window_size: Some(n),
                ..options.clone()
            };
            let result = diff(&a, &b, None, &windowed).unwrap();
            assert_eq!(
                result.diff_count,
                brute_window_max(&map, a.width, a.height, n),
                "{color_space:?} n={n}"
            );
            assert_eq!(
                result.diff_percentage,
                100.0 * result.diff_count as f64 / (n * n) as f64
            );
        }
    }
}

#[test]
fn ignore_mask_skips_pixels() {
    let mut a = Image::new(4, 4);
    a.data.fill(255);
    let mut b = Image::new(4, 4);
    b.data.copy_from_slice(&a.data);
    b.data[..8].fill(0);
    b.data[3] = 255;
    b.data[7] = 255;
    let mut mask = vec![0u8; 16];
    mask[0] = 1;
    for color_space in [ColorSpace::Yiq, ColorSpace::Oklab] {
        let options = DiffOptions {
            color_space,
            include_aa: true,
            ignore_mask: Some(mask.clone()),
            ..Default::default()
        };
        assert_eq!(diff(&a, &b, None, &options).unwrap().diff_count, 1);
        let all = DiffOptions {
            ignore_mask: Some(vec![1; 16]),
            ..options
        };
        assert!(diff(&a, &b, None, &all).unwrap().identical);
    }
}

#[test]
fn rejects_a_mask_of_the_wrong_size() {
    let image = Image::new(2, 2);
    let options = DiffOptions {
        ignore_mask: Some(vec![0; 3]),
        ..Default::default()
    };
    assert!(matches!(
        diff(&image, &image, None, &options),
        Err(DiffError::InvalidMaskSize {
            expected: 4,
            actual: 3
        })
    ));
}

#[test]
fn parses_color_spaces() {
    assert_eq!("oklab".parse::<ColorSpace>(), Ok(ColorSpace::Oklab));
    assert_eq!("yiq".parse::<ColorSpace>(), Ok(ColorSpace::Yiq));
    assert!("lab".parse::<ColorSpace>().is_err());
}
