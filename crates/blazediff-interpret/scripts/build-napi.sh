#!/usr/bin/env bash
set -euo pipefail

# Build blazediff-interpret's N-API .node files ->
# packages/interpret-native/interpret-native-{platform}/.
# The matrix itself lives in crates/scripts/build-napi.sh, shared with
# blazediff and blazediff-ssim; this only names the artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export NAPI_CRATE="blazediff-interpret"
export NAPI_LIB="blazediff_interpret"
export NAPI_ARTIFACT="blazediff-interpret"
export NAPI_NODE="blazediff_interpret.node"
export NAPI_PKG_PREFIX="interpret-native"

exec "$CRATE_DIR/../scripts/build-napi.sh" "$@"
