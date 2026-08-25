"""Smoke tests for the `blazediff_interpret` wheel.

Run via `pnpm test:python`, which builds the host wheel and installs it first.
The result crosses as a plain dict with camelCase keys, matching the N-API
binding and the CLI's `--json`; these pin that shape along with the four entry
points and the region round-trip.
"""

from pathlib import Path

import pytest

import blazediff_interpret as interpret

FIXTURES = Path(__file__).resolve().parents[4] / "fixtures" / "blazediff"

BASE = str(FIXTURES / "1a.png")
CHANGED = str(FIXTURES / "1b.png")
WIDTH, HEIGHT = 1468, 294

TOP_LEVEL_KEYS = {
    "summary",
    "diffCount",
    "totalRegions",
    "regions",
    "severity",
    "diffPercentage",
    "width",
    "height",
}


def test_interpret_images_returns_the_documented_shape():
    result = interpret.interpret_images(BASE, CHANGED)

    assert TOP_LEVEL_KEYS <= set(result)
    assert (result["width"], result["height"]) == (WIDTH, HEIGHT)
    assert result["diffCount"] > 0
    assert result["totalRegions"] == len(result["regions"]) > 0
    assert isinstance(result["summary"], str) and result["summary"]

    region = result["regions"][0]
    assert set(region["bbox"]) == {"x", "y", "width", "height"}
    assert isinstance(region["changeType"], str)
    assert 0.0 <= region["confidence"] <= 1.0


def test_identical_images_have_nothing_to_interpret():
    result = interpret.interpret_images(BASE, BASE)

    assert result["diffCount"] == 0
    assert result["regions"] == []


def test_diff_output_is_written(tmp_path):
    output = tmp_path / "diff.png"

    interpret.interpret_images(BASE, CHANGED, str(output))

    assert output.is_file()
    assert output.stat().st_size > 0


def test_buffers_agree_with_paths():
    from_paths = interpret.interpret_images(BASE, CHANGED)
    from_buffers = interpret.interpret_buffers(
        Path(BASE).read_bytes(), Path(CHANGED).read_bytes()
    )

    assert from_buffers["diffCount"] == from_paths["diffCount"]
    assert from_buffers["totalRegions"] == from_paths["totalRegions"]


def test_interpret_ssim_locates_regions_from_a_score_map():
    result = interpret.interpret_ssim(BASE, CHANGED, metric="ms-ssim")

    assert TOP_LEVEL_KEYS <= set(result)
    assert result["totalRegions"] > 0


def test_interpret_ssim_rejects_an_unknown_metric():
    with pytest.raises(ValueError, match="Unknown metric"):
        interpret.interpret_ssim(BASE, CHANGED, metric="not-a-metric")


def test_regions_round_trip_from_a_prior_result():
    bboxes = [region["bbox"] for region in
              interpret.interpret_images(BASE, CHANGED)["regions"]]

    result = interpret.interpret_regions(BASE, CHANGED, bboxes)

    assert result["totalRegions"] == len(bboxes)


def test_regions_also_take_plain_tuples():
    bbox = interpret.interpret_images(BASE, CHANGED)["regions"][0]["bbox"]

    result = interpret.interpret_regions(
        BASE, CHANGED, [(bbox["x"], bbox["y"], bbox["width"], bbox["height"])]
    )

    assert result["totalRegions"] == 1
    assert result["regions"][0]["bbox"] == bbox


def test_a_malformed_region_raises_value_error():
    with pytest.raises(ValueError):
        interpret.interpret_regions(BASE, CHANGED, [(0, 0)])


def test_a_region_outside_the_image_raises_value_error():
    with pytest.raises(ValueError):
        interpret.interpret_regions(BASE, CHANGED, [(0, 0, WIDTH + 1, HEIGHT)])
