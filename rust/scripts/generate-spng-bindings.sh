#!/bin/bash
# Generates Rust FFI bindings for libspng using bindgen
#
# Usage: ./scripts/generate-spng-bindings.sh
# Run from the rust/ directory

set -e

cd "$(dirname "$0")/.."

bindgen vendor/libspng/spng/spng.h \
    --allowlist-function "spng_.*" \
    --allowlist-type "spng_.*" \
    --allowlist-var "SPNG_.*" \
    --no-layout-tests \
    -o src/spng_ffi.rs

echo "Generated src/spng_ffi.rs"
