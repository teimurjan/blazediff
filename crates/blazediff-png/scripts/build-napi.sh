#!/usr/bin/env bash
set -euo pipefail

# Build blazediff-png's N-API .node files -> packages/codec-png-native/codec-png-native-{platform}/.
# The matrix itself lives in crates/scripts/build-napi.sh, shared with the
# other native families; this only names the artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export NAPI_CRATE="blazediff-png"
export NAPI_LIB="blazediff_png"
export NAPI_ARTIFACT="blazediff-png"
export NAPI_NODE="blazediff_png.node"
export NAPI_PKG_PREFIX="codec-png-native"

exec "$CRATE_DIR/../scripts/build-napi.sh" "$@"
