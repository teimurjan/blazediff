#!/usr/bin/env bash
set -euo pipefail

# Build blazediff-ssim's N-API .node files -> packages/ssim-native-{platform}/.
# The matrix itself lives in crates/scripts/build-napi.sh, shared with
# blazediff; this only names the artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export NAPI_CRATE="blazediff-ssim"
export NAPI_LIB="blazediff_ssim"
export NAPI_ARTIFACT="blazediff-ssim"
export NAPI_NODE="blazediff_ssim.node"
export NAPI_PKG_PREFIX="ssim-native"

exec "$CRATE_DIR/../scripts/build-napi.sh" "$@"
