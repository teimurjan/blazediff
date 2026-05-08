#!/usr/bin/env bash
# One-shot setup: create venv, install benchmark deps, build + install local blazediff wheel.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"               # apps/python-benchmark
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
CRATE_DIR="$REPO_ROOT/crates/blazediff"

cd "$APP_DIR"

if ! command -v uv &> /dev/null; then
    echo "Error: 'uv' is required. Install: https://docs.astral.sh/uv/"
    exit 1
fi

echo "==> uv sync (benchmark deps)"
uv sync

echo "==> building blazediff wheel"
(cd "$CRATE_DIR" && bash scripts/build-maturin.sh)

WHEEL=$(ls -t "$CRATE_DIR"/dist/wheels/blazediff-*.whl 2>/dev/null | head -n1 || true)
if [[ -z "$WHEEL" ]]; then
    echo "Error: no wheel found in $CRATE_DIR/dist/wheels/"
    exit 1
fi

echo "==> installing $WHEEL"
uv pip install --reinstall "$WHEEL"

echo ""
echo "Setup complete. Run benchmarks:"
echo "  pnpm benchmark:python-blazediff"
echo "  pnpm benchmark:python-pixelmatch"
echo "  pnpm benchmark:python-opencv"
