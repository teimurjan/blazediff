"""Smoke tests for the `blazediff` wheel.

Run via `pnpm test:python`, which builds the host wheel and installs it first.
The point is coverage no `cargo` invocation can give: that the module registers,
that the exported names and their signatures are what callers were promised, and
that a `PyDiffResult` carries the fields the README documents.
"""

from pathlib import Path

import pytest

import blazediff

FIXTURES = Path(__file__).resolve().parents[4] / "fixtures" / "blazediff"

BASE = str(FIXTURES / "1a.png")
CHANGED = str(FIXTURES / "1b.png")
# A different fixture pair, so its dimensions differ from BASE's.
OTHER_SIZE = str(FIXTURES / "2a.png")


def test_identical_images_match():
    result = blazediff.compare(BASE, BASE)

    assert result.match_result is True
    assert result.reason is None
    assert result.diff_count is None
    assert result.diff_percentage is None


def test_differing_images_report_a_pixel_diff():
    result = blazediff.compare(BASE, CHANGED)

    assert result.match_result is False
    assert result.reason == "pixel-diff"
    assert result.diff_count > 0
    assert 0 < result.diff_percentage <= 100


def test_mismatched_sizes_report_a_layout_diff():
    result = blazediff.compare(BASE, OTHER_SIZE)

    assert result.match_result is False
    assert result.reason == "layout-diff"
    # Nothing was compared, so there is no count to report.
    assert result.diff_count is None
    assert result.diff_percentage is None


def test_diff_output_is_written(tmp_path):
    output = tmp_path / "diff.png"

    result = blazediff.compare(BASE, CHANGED, str(output))

    assert result.match_result is False
    assert output.is_file()
    assert output.stat().st_size > 0


def test_threshold_is_keyword_only_and_applied():
    strict = blazediff.compare(BASE, CHANGED, threshold=0.0)
    loose = blazediff.compare(BASE, CHANGED, threshold=0.9)

    # A loose enough threshold absorbs the whole difference, and a match
    # reports no count at all.
    assert strict.diff_count > 0
    assert loose.match_result is True

    with pytest.raises(TypeError):
        blazediff.compare(BASE, CHANGED, None, 0.1)


def test_missing_file_raises_value_error():
    with pytest.raises(ValueError):
        blazediff.compare(BASE, str(FIXTURES / "does-not-exist.png"))


def test_repr_names_every_field():
    assert repr(blazediff.compare(BASE, BASE)) == (
        "DiffResult(match_result=True, reason=None, "
        "diff_count=None, diff_percentage=None)"
    )


def png_size(path):
    """Width and height from the IHDR chunk, which always follows the signature."""
    header = Path(path).read_bytes()[16:24]
    return int.from_bytes(header[:4], "big"), int.from_bytes(header[4:], "big")


def test_oklab_matches_pixelmatch_8():
    # pixelmatch 8.0.0 reports 624 differing pixels for this pair with AA detection.
    result = blazediff.compare(BASE, CHANGED, color_space="oklab", antialiasing=True)

    assert result.diff_count == 624


def test_window_size_reports_the_densest_window():
    result = blazediff.compare(
        BASE, CHANGED, color_space="oklab", antialiasing=True, window_size=16
    )

    assert result.diff_count == 256


def test_ignore_mask_skips_pixels():
    width, height = png_size(BASE)

    assert blazediff.compare(BASE, CHANGED, ignore_mask=bytes(width * height)).diff_count == (
        blazediff.compare(BASE, CHANGED).diff_count
    )
    assert blazediff.compare(
        BASE, CHANGED, ignore_mask=b"\x01" * (width * height)
    ).match_result is True

    with pytest.raises(ValueError, match="Invalid ignore mask size"):
        blazediff.compare(BASE, CHANGED, ignore_mask=b"\x00")


def test_unknown_color_space_raises_value_error():
    with pytest.raises(ValueError, match="Unknown color space"):
        blazediff.compare(BASE, CHANGED, color_space="lab")
