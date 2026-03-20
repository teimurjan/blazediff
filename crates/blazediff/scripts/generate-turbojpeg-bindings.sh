#!/bin/bash
# Generates Rust FFI bindings for libjpeg-turbo (TurboJPEG API) using bindgen
#
# Usage: ./scripts/generate-turbojpeg-bindings.sh
# Run from the rust/ directory

set -e

cd "$(dirname "$0")/.."

bindgen vendor/libjpeg-turbo/src/turbojpeg.h \
    --allowlist-function "tj.*" \
    --allowlist-type "tj.*|TJ.*" \
    --allowlist-var "TJ.*|TJFLAG.*|TJPF.*|TJCS.*|TJSAMP.*" \
    --no-layout-tests \
    -o src/turbojpeg_ffi.rs

echo "Generated src/turbojpeg_ffi.rs"
