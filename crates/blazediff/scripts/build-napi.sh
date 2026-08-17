#!/usr/bin/env bash
set -euo pipefail

# Build blazediff's N-API .node files -> packages/core-native-{platform}/.
# The matrix itself lives in crates/scripts/build-napi.sh, shared with
# blazediff-ssim; this only names the artifacts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRATE_DIR="$(dirname "$SCRIPT_DIR")"

export CRATE_DIR
export NAPI_CRATE="blazediff"
export NAPI_LIB="blazediff"
export NAPI_ARTIFACT="blazediff"
export NAPI_NODE="blazediff.node"
export NAPI_PKG_PREFIX="core-native"
# This crate has a pyo3 path, so a python-tainted .so is possible here.
export NAPI_CHECK_PYTHON="true"

exec "$CRATE_DIR/../scripts/build-napi.sh" "$@"
