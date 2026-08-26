#!/usr/bin/env bash
set -euo pipefail

# Build every PyPI wheel for the host and run its pytest suite against the
# installed module.
#
# Nothing else in CI imports a built wheel, so a broken `#[pymodule]` — a
# renamed export, a `#[pyclass]` that no longer registers, a signature that
# doesn't match the tests — would otherwise only surface after publishing.
# `cargo check --features python` catches compile breaks; this catches the rest.
#
# The venv lands under the repo's gitignored dist/, and the wheels are built
# with --no-sync so the committed six-platform sets in crates/*/wheels/ are left
# exactly as they are.
#
# Usage: pnpm test:python   (or ./scripts/checks/test-python.sh)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="$ROOT/dist/python-test-venv"
PYTHON="$VENV/bin/python"

# `_targets.sh` adds -mevex512 to the x86_64 Linux C flags to appease zig's
# clang, which is how the *released* wheels are cross-built. Everything here is
# a `--native` build, which never goes through zig, and GCC below 14 — the
# runner's cc — has no such flag. Same reason benchmark-binary.yml sets it.
# Overridable for the one case that still needs the flag natively: a host cc
# that is clang 18 or newer.
export BLAZEDIFF_SKIP_EVEX512="${BLAZEDIFF_SKIP_EVEX512:-1}"

CRATES=(blazediff blazediff-ssim blazediff-interpret)

for tool in uv maturin; do
    if ! command -v "$tool" &> /dev/null; then
        echo "Error: '$tool' is required."
        echo "  uv:      https://docs.astral.sh/uv/getting-started/installation/"
        echo "  maturin: uv tool install maturin"
        exit 1
    fi
done

echo "==> Creating venv at $VENV"
rm -rf "$VENV"
uv venv "$VENV"
uv pip install --python "$PYTHON" pytest

TEST_DIRS=()
for crate in "${CRATES[@]}"; do
    echo ""
    echo "==> Building $crate for the host"
    "$ROOT/crates/$crate/scripts/build-maturin.sh" --native --no-sync

    wheels=("$ROOT/crates/$crate/dist/wheels"/*.whl)
    if [[ ${#wheels[@]} -ne 1 ]]; then
        echo "Error: expected exactly one host wheel for $crate, found ${#wheels[@]}."
        exit 1
    fi
    echo "==> Installing $(basename "${wheels[0]}")"
    uv pip install --python "$PYTHON" "${wheels[0]}"

    TEST_DIRS+=("$ROOT/crates/$crate/tests/python")
done

echo ""
echo "==> Running pytest"
"$VENV/bin/pytest" -q "${TEST_DIRS[@]}"
