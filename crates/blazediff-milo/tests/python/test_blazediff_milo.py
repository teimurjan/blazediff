"""Smoke tests for the `blazediff_milo` wheel.

Run via `pnpm test:python`, which builds the host wheel and installs it first.
These assert the binding's contract: the exported names, the keyword arguments,
the result fields and the error type. The metric's numbers are pinned against
PyTorch by `tests/parity.rs`; one of them is spot-checked here to prove the
binding forwards them intact.
"""

import array
import json
import struct
from pathlib import Path

import pytest

import blazediff_milo as milo

ROOT = Path(__file__).resolve().parents[4]
FIXTURES = ROOT / "fixtures" / "blazediff"
REFERENCE = json.loads(
    (ROOT / "crates" / "blazediff-milo" / "tests" / "fixtures" / "reference.json").read_text()
)

BASE = str(FIXTURES / "1a.png")
CHANGED = str(FIXTURES / "1b.png")
# Different size from 1a/1b.
OTHER = str(FIXTURES / "2b.png")

RGBA_SIDE = 32


def rgba(side, shift=0):
    """A deterministic RGBA8 gradient, so no image decoder is needed here."""
    return bytes(
        value
        for y in range(side)
        for x in range(side)
        for value in ((x + shift) % 256, y % 256, (x ^ y) % 256, 255)
    )


def reference_case(name_a, name_b):
    return next(
        case
        for case in REFERENCE["fixtures"]
        if case["reference"] == name_a and case["distorted"] == name_b
    )


def test_identical_images_score_zero():
    result = milo.compare(BASE, BASE)

    assert result.raw_error == 0.0
    assert result.mos == pytest.approx(4.346, abs=0.01)
    assert result.match_result is True
    assert result.reason is None
    assert (result.width, result.height) == (1468, 294)


def test_differing_images_score_what_pytorch_scores():
    result = milo.compare(BASE, CHANGED)
    expected = reference_case("blazediff/1a.png", "blazediff/1b.png")

    assert result.raw_error == pytest.approx(expected["raw_error"], rel=1e-4)
    assert result.mos == pytest.approx(expected["mos"], abs=1e-4)
    assert result.match_result is False
    assert result.reason == "error-above-threshold"


def test_max_error_admits_a_small_change():
    assert milo.compare(BASE, CHANGED, max_error=0.01).match_result is True


def test_threads_do_not_change_the_answer():
    serial = milo.compare(BASE, CHANGED, threads=1)
    parallel = milo.compare(BASE, CHANGED)

    assert serial.raw_error == parallel.raw_error
    assert serial.mos == parallel.mos


def test_maps_are_returned_only_on_request():
    without = milo.compare(BASE, CHANGED)
    assert without.mask is None
    assert without.error_map is None

    with_maps = milo.compare(BASE, CHANGED, return_maps=True)
    pixels = with_maps.width * with_maps.height
    assert len(with_maps.mask) == pixels * 4
    assert len(with_maps.error_map) == pixels * 4

    error_map = array.array("f")
    error_map.frombytes(with_maps.error_map)
    assert len(error_map) == pixels
    assert all(0.0 <= value <= 1.0 for value in error_map)
    assert any(value > 0.0 for value in error_map)


def test_buffers_agree_with_paths():
    from_paths = milo.compare(BASE, CHANGED)
    from_buffers = milo.compare_buffers(
        Path(BASE).read_bytes(), Path(CHANGED).read_bytes()
    )

    assert from_buffers.raw_error == from_paths.raw_error
    assert from_buffers.mos == from_paths.mos


def test_compare_rgba_takes_raw_pixels():
    same = milo.compare_rgba(rgba(RGBA_SIDE), rgba(RGBA_SIDE), RGBA_SIDE, RGBA_SIDE)
    assert same.raw_error == 0.0
    assert same.match_result is True

    shifted = milo.compare_rgba(
        rgba(RGBA_SIDE), rgba(RGBA_SIDE, shift=64), RGBA_SIDE, RGBA_SIDE
    )
    assert shifted.raw_error > 0.0
    assert shifted.mos < same.mos


def test_map_output_is_written(tmp_path):
    output = tmp_path / "map.png"

    milo.compare(BASE, CHANGED, str(output))

    assert output.is_file()
    assert output.stat().st_size > 0


def test_render_map_paints_an_rgba_buffer():
    result = milo.compare(BASE, CHANGED, return_maps=True)

    painted = milo.render_map(result.error_map, result.width, result.height)

    assert len(painted) == result.width * result.height * 4


def test_render_map_rejects_a_truncated_map():
    with pytest.raises(ValueError):
        milo.render_map(struct.pack("<fB", 1.0, 0), 1, 1)


def test_mismatched_sizes_raise_value_error():
    with pytest.raises(ValueError, match="do not match"):
        milo.compare(BASE, OTHER)


def test_tiny_images_raise_value_error():
    side = 15
    with pytest.raises(ValueError, match="too small"):
        milo.compare_rgba(rgba(side), rgba(side), side, side)


def test_options_are_keyword_only():
    with pytest.raises(TypeError):
        milo.compare(BASE, CHANGED, None, 0.5)


def test_repr_names_the_scores():
    text = repr(milo.compare(BASE, BASE))
    assert text.startswith("MiloResult(")
    assert "raw_error=0" in text
