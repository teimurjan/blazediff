#!/usr/bin/env bash
set -euo pipefail

# Build the wasm32 artifact (+ wasm-bindgen JS glue) for
# @blazediff/interpret-wasm. The build itself lives in
# crates/scripts/build-wasm.sh, shared with blazediff; this only names the
# artifact.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export WASM_CRATE="blazediff-interpret"
export WASM_LIB="blazediff_interpret"
export WASM_OUT_NAME="blazediff_interpret"
export WASM_PKG_DIR="interpret-wasm"

exec "$CRATE_DIR/../scripts/build-wasm.sh" "$@"
