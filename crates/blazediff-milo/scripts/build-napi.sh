#!/usr/bin/env bash
set -euo pipefail

# Build blazediff-milo's N-API .node files -> packages/milo-native/milo-native-{platform}/.
# The matrix itself lives in crates/scripts/build-napi.sh, shared with
# blazediff and blazediff-ssim; this only names the artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export NAPI_CRATE="blazediff-milo"
export NAPI_LIB="blazediff_milo"
export NAPI_ARTIFACT="blazediff-milo"
export NAPI_NODE="blazediff_milo.node"
export NAPI_PKG_PREFIX="milo-native"

exec "$CRATE_DIR/../scripts/build-napi.sh" "$@"
