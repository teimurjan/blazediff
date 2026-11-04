"""Smoke tests for the `blazediff` wheel.

Run via `pnpm test:python`, which builds the host wheel and installs it first.
The point is coverage no `cargo` invocation can give: that the module registers,
that the exported names and their signatures are what callers were promised, and
that a `DiffResult` carries the fields the README documents.
"""

from pathlib import Path

import pytest

import blazediff

FIXTURES = Path(__file__).resolve().parents[4] / "fixtures" / "blazediff"

BASE = str(FIXTURES / "1a.png")
CHANGED = str(FIXTURES / "1b.png")
# A different fixture pair, so its dimensions differ from BASE's.
OTHER_SIZE = str(FIXTURES / "2a.png")
MISSING = str(FIXTURES / "does-not-exist.png")


def png_size(path):
    """Width and height from the IHDR chunk, which always follows the signature."""
    header = Path(path).read_bytes()[16:24]
    return int.from_bytes(header[:4], "big"), int.from_bytes(header[4:], "big")


def test_identical_images_report_no_diff():
    result = blazediff.diff(BASE, BASE)

    assert result.kind == "compared"
    assert result.count == 0
    assert result.percentage == 0
    assert result.identical is True
    assert result.window is None


def test_differing_images_report_a_count():
    result = blazediff.diff(BASE, CHANGED)
    width, height = png_size(BASE)

    assert result.kind == "compared"
    assert result.identical is False
    assert result.count > 0
    assert result.percentage == pytest.approx(100 * result.count / (width * height))


def test_encoded_bytes_match_paths():
    from_bytes = blazediff.diff(Path(BASE).read_bytes(), Path(CHANGED).read_bytes())

    assert from_bytes.count == blazediff.diff(BASE, CHANGED).count


def test_mismatched_sizes_report_both_sizes():
    result = blazediff.diff(BASE, OTHER_SIZE)

    assert result.kind == "dimension-mismatch"
    assert (result.a.width, result.a.height) == png_size(BASE)
    assert (result.b.width, result.b.height) == png_size(OTHER_SIZE)
    # Nothing was compared, so there is no count to report.
    assert result.count is None


def test_output_is_written_only_when_images_differ(tmp_path):
    changed = tmp_path / "diff.png"
    same = tmp_path / "same.png"

    blazediff.diff(BASE, CHANGED, str(changed))
    blazediff.diff(BASE, BASE, str(same))

    assert changed.is_file() and changed.stat().st_size > 0
    assert not same.exists()


def test_options_are_keyword_only_and_applied():
    strict = blazediff.diff(BASE, CHANGED, threshold=0.0)
    loose = blazediff.diff(BASE, CHANGED, threshold=0.9)

    # A loose enough threshold absorbs the whole difference.
    assert strict.count > 0
    assert loose.identical is True

    with pytest.raises(TypeError):
        blazediff.diff(BASE, CHANGED, None, 0.1)


def test_antialiasing_is_detected_by_default():
    assert blazediff.diff(BASE, CHANGED, antialiasing=False).count > (
        blazediff.diff(BASE, CHANGED).count
    )


def test_missing_file_reports_an_io_error():
    result = blazediff.diff(BASE, MISSING)

    assert result.kind == "io-error"
    assert result.path == MISSING
    assert result.message


def test_repr_names_the_fields_of_its_kind():
    assert repr(blazediff.diff(BASE, BASE)) == (
        "DiffResult(kind='compared', count=0, percentage=0, identical=True, window=None)"
    )


def test_oklab_matches_pixelmatch_8():
    # pixelmatch 8.0.0 reports 624 differing pixels for this pair with AA detection.
    assert blazediff.diff(BASE, CHANGED, metric="oklab").count == 624


def test_window_reports_the_busiest_window_next_to_the_total():
    result = blazediff.diff(BASE, CHANGED, metric="oklab", window=16)

    # pixelmatch 8 reports 256 for windowSize 16.
    assert result.count == 624
    assert result.window.count == 256
    assert repr(result.window).startswith("WindowHit(")


def test_mask_skips_pixels():
    width, height = png_size(BASE)

    assert blazediff.diff(BASE, CHANGED, mask=bytes(width * height)).count == (
        blazediff.diff(BASE, CHANGED).count
    )
    assert blazediff.diff(BASE, CHANGED, mask=b"\x01" * (width * height)).identical

    with pytest.raises(ValueError, match="Invalid mask size"):
        blazediff.diff(BASE, CHANGED, mask=b"\x00")


@pytest.mark.parametrize(
    "options, message",
    [
        ({"metric": "lab"}, "Unknown metric"),
        ({"background": "none"}, "Unknown background"),
        ({"diff_color": [1, 2]}, "diff_color: expected 3 channels"),
    ],
)
def test_invalid_options_raise_value_error(options, message):
    with pytest.raises(ValueError, match=message):
        blazediff.diff(BASE, CHANGED, **options)
