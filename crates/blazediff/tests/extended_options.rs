//! `metric`, `mask` and `window` against pixelmatch 8 and against the
//! default YIQ path.

use blazediff::{
    diff, load_png, Background, DiffError, DiffOptions, DiffResult, Image, Metric, RenderOptions,
    WindowHit,
};
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
/// With a window, pixelmatch returns the busiest window's count.
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

/// What pixelmatch 8 returns: the window count with a window, else the total.
fn pixelmatch_count(result: &DiffResult) -> u32 {
    match result {
        DiffResult::Compared {
            window: Some(hit), ..
        } => hit.count,
        DiffResult::Compared { count, .. } => *count,
        DiffResult::DimensionMismatch { .. } => panic!("unexpected dimension mismatch"),
    }
}

#[test]
fn oklab_matches_pixelmatch_8() {
    for (name, expected) in PIXELMATCH_8 {
        let (a, b) = fixture(name);
        let oklab = DiffOptions {
            metric: Metric::Oklab,
            ..Default::default()
        };
        let cases = [
            oklab.clone(),
            DiffOptions {
                antialiasing: false,
                ..oklab.clone()
            },
            DiffOptions {
                threshold: 0.05,
                ..oklab.clone()
            },
            DiffOptions {
                window: Some(16),
                ..oklab.clone()
            },
            DiffOptions {
                mask: Some(stripe_mask(&a)),
                ..oklab.clone()
            },
            DiffOptions {
                mask: Some(stripe_mask(&a)),
                window: Some(8),
                antialiasing: false,
                ..oklab.clone()
            },
        ];
        for (case, (options, want)) in cases.iter().zip(expected).enumerate() {
            let counted = pixelmatch_count(&diff(&a, &b, None, options).unwrap());
            assert_eq!(counted, want, "{name} case {case} without output");
            let mut output = Image::new(a.width, a.height);
            let drawn = pixelmatch_count(&diff(&a, &b, Some(&mut output), options).unwrap());
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
                antialiasing: false,
                ..Default::default()
            },
            DiffOptions {
                render: RenderOptions {
                    background: Background::Transparent,
                    ..Default::default()
                },
                ..Default::default()
            },
        ] {
            let masked = DiffOptions {
                mask: Some(vec![0; (a.width * a.height) as usize]),
                ..base.clone()
            };
            let mut plain_out = Image::new(a.width, a.height);
            let mut masked_out = Image::new(a.width, a.height);
            let plain = diff(&a, &b, Some(&mut plain_out), &base).unwrap();
            let with_mask = diff(&a, &b, Some(&mut masked_out), &masked).unwrap();
            assert_eq!(with_mask, plain, "{name}");
            if !plain.is_identical() {
                assert!(masked_out.data == plain_out.data, "{name} output differs");
            }
            assert_eq!(diff(&a, &b, None, &masked).unwrap(), plain, "{name}");
        }
    }
}

/// Counted diff pixels as a 0/1 map, read from a transparent-background render.
fn counted_map(a: &Image, b: &Image, options: &DiffOptions) -> Vec<u8> {
    let mut output = Image::new(a.width, a.height);
    let render = DiffOptions {
        render: RenderOptions {
            background: Background::Transparent,
            diff_color: [255, 0, 0],
            diff_color_alt: None,
            aa_color: [0, 0, 255],
            ..Default::default()
        },
        mask: None,
        window: None,
        ..options.clone()
    };
    diff(a, b, Some(&mut output), &render).unwrap();
    output
        .as_u32()
        .iter()
        .map(|&pixel| u8::from(pixel == 0xFF00_00FF))
        .collect()
}

/// The first busiest window in row-major order.
fn brute_window_max(map: &[u8], width: u32, height: u32, n: u32) -> WindowHit {
    let (w, h, n) = (width as usize, height as usize, n as usize);
    let mut best = WindowHit {
        x: 0,
        y: 0,
        count: 0,
    };
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
            if count > best.count {
                best = WindowHit {
                    x: x as u32,
                    y: y as u32,
                    count,
                };
            }
        }
    }
    best
}

#[test]
fn window_matches_a_brute_force_maximum() {
    let (a, b) = fixture("pixelmatch/3");
    for metric in [Metric::Yiq, Metric::Oklab] {
        let options = DiffOptions {
            metric,
            ..Default::default()
        };
        let total = diff(&a, &b, None, &options).unwrap();
        let map = counted_map(&a, &b, &options);
        for n in [1, 4, 16, 64] {
            let windowed = DiffOptions {
                window: Some(n),
                ..options.clone()
            };
            let DiffResult::Compared {
                count,
                percentage,
                window,
                ..
            } = diff(&a, &b, None, &windowed).unwrap()
            else {
                panic!("unexpected dimension mismatch");
            };
            assert_eq!(
                window,
                Some(brute_window_max(&map, a.width, a.height, n)),
                "{metric:?} n={n}"
            );
            assert_eq!(Some(count), total.count(), "{metric:?} n={n} total");
            assert_eq!(
                percentage,
                100.0 * count as f64 / (a.width * a.height) as f64
            );
        }
    }
}

#[test]
fn window_reports_an_empty_hit_for_identical_images() {
    let (a, _) = fixture("pixelmatch/3");
    let options = DiffOptions {
        window: Some(8),
        ..Default::default()
    };
    assert_eq!(
        diff(&a, &a, None, &options).unwrap(),
        DiffResult::Compared {
            count: 0,
            percentage: 0.0,
            identical: true,
            window: Some(WindowHit {
                x: 0,
                y: 0,
                count: 0
            }),
        }
    );
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
    for metric in [Metric::Yiq, Metric::Oklab] {
        let options = DiffOptions {
            metric,
            antialiasing: false,
            mask: Some(mask.clone()),
            ..Default::default()
        };
        assert_eq!(diff(&a, &b, None, &options).unwrap().count(), Some(1));
        let all = DiffOptions {
            mask: Some(vec![1; 16]),
            ..options
        };
        assert!(diff(&a, &b, None, &all).unwrap().is_identical());
    }
}

#[test]
fn rejects_a_mask_of_the_wrong_size() {
    let image = Image::new(2, 2);
    let options = DiffOptions {
        mask: Some(vec![0; 3]),
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
fn rejects_a_buffer_that_does_not_match_its_size() {
    let mut image = Image::new(2, 2);
    image.data.pop();
    assert!(matches!(
        diff(&image, &image, None, &DiffOptions::default()),
        Err(DiffError::InvalidDataSize {
            expected: 16,
            actual: 15
        })
    ));
}

#[test]
fn parses_metrics_and_backgrounds() {
    assert_eq!("oklab".parse::<Metric>(), Ok(Metric::Oklab));
    assert_eq!("yiq".parse::<Metric>(), Ok(Metric::Yiq));
    assert_eq!(
        "lab".parse::<Metric>(),
        Err("Unknown metric: lab. Expected \"yiq\" or \"oklab\".".to_string())
    );
    assert_eq!(
        "transparent".parse::<Background>(),
        Ok(Background::Transparent)
    );
    assert!("none".parse::<Background>().is_err());
}

#[test]
fn identical_images_fill_the_output_gray() {
    let (a, b) = fixture("pixelmatch/1");
    let mut copy = Image::new(a.width, a.height);
    copy.data.copy_from_slice(&a.data);
    let mut same_buffer = Image::new(a.width, a.height);
    diff(&a, &a, Some(&mut same_buffer), &DiffOptions::default()).unwrap();
    for (second, threshold) in [(&copy, 0.1), (&b, 1.0)] {
        let mut output = Image::new(a.width, a.height);
        let options = DiffOptions {
            threshold,
            ..Default::default()
        };
        let result = diff(&a, second, Some(&mut output), &options).unwrap();
        assert!(result.is_identical());
        assert!(output.data == same_buffer.data);
    }
}
