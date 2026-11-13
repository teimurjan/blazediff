//! `diff_rgba` over borrowed bytes must match `diff` over owned images.

use blazediff::{diff, diff_rgba, load_png, DiffOptions, DiffResult, Image, ImageView, Size};
use std::path::PathBuf;

fn fixture(name: &str) -> (Image, Image) {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures");
    let a = load_png(dir.join(format!("{name}a.png"))).unwrap();
    let b = load_png(dir.join(format!("{name}b.png"))).unwrap();
    (a, b)
}

/// `bytes` copied to an odd offset, so the slice is never 4-byte aligned.
fn misaligned(bytes: &[u8]) -> (Vec<u8>, usize) {
    let mut storage = vec![0u8; bytes.len() + 4];
    let offset = (1..4)
        .find(|&o| (storage.as_ptr() as usize + o) % 4 != 0)
        .unwrap();
    storage[offset..offset + bytes.len()].copy_from_slice(bytes);
    (storage, offset)
}

#[test]
fn matches_diff_on_aligned_buffers() {
    let options = DiffOptions::default();
    for name in ["pixelmatch/1", "pixelmatch/4", "alpha/1"] {
        let (a, b) = fixture(name);
        let mut expected_out = Image::new(a.width, a.height);
        let expected = diff(&a, &b, Some(&mut expected_out), &options).unwrap();

        let mut out = vec![0u8; a.data.len()];
        let result = diff_rgba((&a).into(), (&b).into(), Some(&mut out), &options).unwrap();

        assert_eq!(result.count(), expected.count(), "{name}");
        assert_eq!(out, expected_out.data, "{name}");
    }
}

#[test]
fn matches_diff_on_misaligned_buffers() {
    let options = DiffOptions::default();
    let (a, b) = fixture("pixelmatch/4");
    let mut expected_out = Image::new(a.width, a.height);
    let expected = diff(&a, &b, Some(&mut expected_out), &options).unwrap();

    let (a_bytes, a_at) = misaligned(&a.data);
    let (b_bytes, b_at) = misaligned(&b.data);
    let (mut out_bytes, out_at) = misaligned(&vec![0u8; a.data.len()]);
    let len = a.data.len();
    let view = |data| ImageView {
        data,
        width: a.width,
        height: a.height,
    };
    let result = diff_rgba(
        view(&a_bytes[a_at..a_at + len]),
        view(&b_bytes[b_at..b_at + len]),
        Some(&mut out_bytes[out_at..out_at + len]),
        &options,
    )
    .unwrap();

    assert_eq!(result.count(), expected.count());
    assert_eq!(&out_bytes[out_at..out_at + len], &expected_out.data[..]);
}

#[test]
fn reports_dimension_mismatch() {
    let a = vec![0u8; 4 * 4 * 4];
    let b = vec![0u8; 2 * 8 * 4];
    let result = diff_rgba(
        ImageView {
            data: &a,
            width: 4,
            height: 4,
        },
        ImageView {
            data: &b,
            width: 2,
            height: 8,
        },
        None,
        &DiffOptions::default(),
    )
    .unwrap();

    assert!(matches!(
        result,
        DiffResult::DimensionMismatch {
            a: Size {
                width: 4,
                height: 4
            },
            b: Size {
                width: 2,
                height: 8
            },
        }
    ));
}

#[test]
fn rejects_wrong_buffer_length() {
    let a = vec![0u8; 15];
    let view = ImageView {
        data: &a,
        width: 2,
        height: 2,
    };
    assert!(diff_rgba(view, view, None, &DiffOptions::default()).is_err());
}
