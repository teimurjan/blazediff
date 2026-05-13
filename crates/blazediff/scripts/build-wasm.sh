#!/usr/bin/env bash
set -euo pipefail

# Build the wasm32 artifact (+ wasm-bindgen JS glue) for @blazediff/core-wasm.
# Single target, no cross-compilation matrix — wasm is wasm.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

# Keep wasm-bindgen-cli pinned in lockstep with the wasm-bindgen crate dep
# in Cargo.toml. Mismatched versions error out at the post-process step.
WASM_BINDGEN_VERSION="${WASM_BINDGEN_VERSION:-0.2.100}"

OUT_DIR="$PACKAGES_DIR/core-wasm/wasm"
WASM_FILE="$TARGET_DIR/wasm32-unknown-unknown/release/blazediff.wasm"

echo "Building blazediff for wasm32-unknown-unknown..."
rustup target add wasm32-unknown-unknown 2>/dev/null || true

cd "$PROJECT_DIR"

RUSTFLAGS="-C target-feature=+simd128,+bulk-memory" \
    cargo build --release \
        --target wasm32-unknown-unknown \
        --no-default-features --features wasm \
        --manifest-path "$WORKSPACE_DIR/Cargo.toml" \
        -p blazediff

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
    --out-name blazediff \
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
        -o "$OUT_DIR/blazediff_bg.wasm" "$OUT_DIR/blazediff_bg.wasm"
fi

echo ""
echo "Done. Output:"
ls -lh "$OUT_DIR"
