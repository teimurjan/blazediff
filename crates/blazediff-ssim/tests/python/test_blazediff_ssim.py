"""Smoke tests for the `blazediff_ssim` wheel.

Run via `pnpm test:python`, which builds the host wheel and installs it first.
These assert the binding's contract — the exported names, the keyword arguments,
the result fields and the error type — not the metrics themselves, whose
numerical behaviour is pinned by `tests/matlab_parity.rs`.
"""

import array
import struct
from pathlib import Path

import pytest

import blazediff_ssim as ssim

FIXTURES = Path(__file__).resolve().parents[4] / "fixtures" / "blazediff"

BASE = str(FIXTURES / "1a.png")
CHANGED = str(FIXTURES / "1b.png")

METRICS = ["ssim", "ms-ssim", "hitchhikers-ssim", "perceptual-ssim"]

# Small enough to stay fast, comfortably above the 11-sample default window.
RGBA_SIDE = 64


def rgba(side, shift=0):
    """A deterministic RGBA8 gradient, so no image decoder is needed here."""
    return bytes(
        value
        for y in range(side)
        for x in range(side)
        for value in ((x + shift) % 256, y % 256, (x ^ y) % 256, 255)
    )


def test_metrics_lists_every_accepted_name():
    assert ssim.metrics() == METRICS


@pytest.mark.parametrize("metric", METRICS)
def test_identical_images_score_one(metric):
    result = ssim.compare(BASE, BASE, metric=metric, min_score=0.999)

    assert result.metric == metric
    assert result.score == pytest.approx(1.0, abs=1e-6)
    assert result.match_result is True
    assert result.reason is None
    assert result.below_count == 0


@pytest.mark.parametrize("metric", METRICS)
def test_differing_images_score_below_one(metric):
    result = ssim.compare(BASE, CHANGED, metric=metric)

    assert result.metric == metric
    assert result.score < 1.0
    assert result.match_result is False
    assert result.reason == "score-below-threshold"
    assert result.below_count > 0
    assert 0 < result.below_percentage <= 100


def test_map_is_returned_only_on_request():
    without = ssim.compare(BASE, CHANGED)
    assert without.map is None
    assert without.map_width > 0 and without.map_height > 0

    with_map = ssim.compare(BASE, CHANGED, return_map=True)
    expected = with_map.map_width * with_map.map_height
    assert len(with_map.map) == expected * 4

    scores = array.array("f")
    scores.frombytes(with_map.map)
    assert len(scores) == expected
    assert all(-1.0 <= score <= 1.0 for score in scores)


def test_buffers_agree_with_paths():
    from_paths = ssim.compare(BASE, CHANGED)
    from_buffers = ssim.compare_buffers(
        Path(BASE).read_bytes(), Path(CHANGED).read_bytes()
    )

    assert from_buffers.score == from_paths.score
    assert from_buffers.below_count == from_paths.below_count


def test_compare_rgba_takes_raw_pixels():
    same = ssim.compare_rgba(
        rgba(RGBA_SIDE), rgba(RGBA_SIDE), RGBA_SIDE, RGBA_SIDE, min_score=0.999
    )
    assert same.score == pytest.approx(1.0, abs=1e-6)
    assert same.match_result is True

    shifted = ssim.compare_rgba(
        rgba(RGBA_SIDE), rgba(RGBA_SIDE, shift=64), RGBA_SIDE, RGBA_SIDE
    )
    assert shifted.score < 1.0


def test_map_output_is_written(tmp_path):
    output = tmp_path / "map.png"

    ssim.compare(BASE, CHANGED, str(output))

    assert output.is_file()
    assert output.stat().st_size > 0


def test_render_map_paints_an_rgba_buffer():
    result = ssim.compare(BASE, CHANGED, return_map=True)

    painted = ssim.render_map(
        result.map, result.map_width, result.map_height, 32, 16
    )

    assert len(painted) == 32 * 16 * 4


def test_render_map_rejects_a_truncated_map():
    with pytest.raises(ValueError):
        ssim.render_map(struct.pack("<fB", 1.0, 0), 1, 1, 4, 4)


def test_unknown_metric_raises_value_error():
    with pytest.raises(ValueError, match="Unknown metric"):
        ssim.compare(BASE, CHANGED, metric="not-a-metric")


def test_zero_window_size_raises_value_error():
    with pytest.raises(ValueError, match="window_size"):
        ssim.compare(BASE, CHANGED, window_size=0)


def test_options_are_keyword_only():
    with pytest.raises(TypeError):
        ssim.compare(BASE, CHANGED, None, "ms-ssim")
