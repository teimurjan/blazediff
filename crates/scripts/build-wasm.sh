#!/usr/bin/env bash
set -euo pipefail

# Build a wasm32 artifact (+ wasm-bindgen JS glue) for one of the wasm packages.
# Single target, no cross-compilation matrix — wasm is wasm.
#
# Callers set CRATE_DIR and the WASM_* variables naming the artifact; each crate
# that ships a wasm package has a shim in its own scripts/ that does exactly
# that, the same way build-napi.sh is driven. Defaults reproduce the original
# core build so a bare invocation still produces @blazediff/core-wasm.

: "${CRATE_DIR:?CRATE_DIR must be set before running build-wasm.sh}"

# Cargo package to build.
WASM_CRATE="${WASM_CRATE:-blazediff}"
# `[lib] name`, i.e. what cargo writes into target/.../release/<lib>.wasm.
WASM_LIB="${WASM_LIB:-blazediff}"
# wasm-bindgen --out-name; decides the generated <name>.js / <name>_bg.wasm.
WASM_OUT_NAME="${WASM_OUT_NAME:-blazediff}"
# Destination package under packages/.
WASM_PKG_DIR="${WASM_PKG_DIR:-core-wasm}"

# shellcheck source=./_targets.sh
source "$CRATE_DIR/../scripts/_targets.sh"

# Keep wasm-bindgen-cli pinned in lockstep with the wasm-bindgen crate dep
# in Cargo.toml. Mismatched versions error out at the post-process step.
WASM_BINDGEN_VERSION="${WASM_BINDGEN_VERSION:-0.2.100}"

OUT_DIR="$PACKAGES_DIR/$WASM_PKG_DIR/wasm"
WASM_FILE="$TARGET_DIR/wasm32-unknown-unknown/release/$WASM_LIB.wasm"

echo "Building $WASM_CRATE for wasm32-unknown-unknown..."
rustup target add wasm32-unknown-unknown 2>/dev/null || true

cd "$PROJECT_DIR"

RUSTFLAGS="-C target-feature=+simd128,+bulk-memory" \
    cargo build --release \
        --target wasm32-unknown-unknown \
        --no-default-features --features wasm \
        --manifest-path "$WORKSPACE_DIR/Cargo.toml" \
        -p "$WASM_CRATE"

if [[ ! -f "$WASM_FILE" ]]; then
    echo "Error: wasm artifact not found at $WASM_FILE"
    exit 1
fi

echo "Raw wasm size: $(ls -lh "$WASM_FILE" | awk '{print $5}')"

if ! command -v wasm-bindgen &> /dev/null; then
    echo "Installing wasm-bindgen-cli $WASM_BINDGEN_VERSION..."
    cargo install -f wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION"
fi

mkdir -p "$OUT_DIR"
echo "Running wasm-bindgen..."
wasm-bindgen "$WASM_FILE" \
    --out-dir "$OUT_DIR" \
    --out-name "$WASM_OUT_NAME" \
    --target web

if command -v wasm-opt &> /dev/null; then
    echo "Running wasm-opt -O3..."
    wasm-opt -O3 \
        --enable-simd \
        --enable-bulk-memory \
        --enable-mutable-globals \
        --enable-nontrapping-float-to-int \
        --enable-sign-ext \
        --enable-reference-types \
        --enable-multivalue \
        -o "$OUT_DIR/${WASM_OUT_NAME}_bg.wasm" "$OUT_DIR/${WASM_OUT_NAME}_bg.wasm"
fi

echo ""
echo "Done. Output:"
ls -lh "$OUT_DIR"
