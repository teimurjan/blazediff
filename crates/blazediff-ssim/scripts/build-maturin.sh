#!/usr/bin/env bash
set -euo pipefail

# Build blazediff-ssim's Python wheels -> crates/blazediff-ssim/wheels/.
# The matrix itself lives in crates/scripts/build-maturin.sh, shared with
# blazediff and blazediff-interpret; the distribution name, wheel prefix and
# version all come from this crate's pyproject.toml.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR

exec "$CRATE_DIR/../scripts/build-maturin.sh" "$@"
