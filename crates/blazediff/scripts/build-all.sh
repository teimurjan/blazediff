#!/usr/bin/env bash
set -euo pipefail

# Cross-platform release build orchestrator for blazediff.
# - Always builds the CLI binary (`blazediff`) for the chosen target(s).
# - With --napi, delegates to build-napi.sh for the same target scope.
# - With --maturin, delegates to build-maturin.sh for the same target scope.
# Outputs to crates/blazediff/dist/ and syncs CLI binaries to packages/core-native-{platform}/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

print_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --target <TARGET>  Build for specific target
  --native           Build for current platform (default; target-cpu=native)
  --macos            Build both macOS targets (arm64 + x64)
  --all              Build all platforms (requires 'cross')
  --napi             Also invoke build-napi.sh   for the same scope
  --maturin          Also invoke build-maturin.sh for the same scope
  --wasm             Also build wasm32 artifact for @blazediff/core-wasm
  --list             List supported targets
  --help             Show this help

Output naming: blazediff-{os}-{arch}[.exe|.node|.whl]
EOF
}

build_target() {
    local target="$1"
    local use_cross="${2:-false}"
    local friendly; friendly=$(get_friendly_name "$target")
    local output_name="blazediff-${friendly}"

    echo "Building $output_name ($target)..."
    mkdir -p "$DIST_DIR"
    local flags; flags=$(get_rustflags "$target")

    if [[ "$target" == *"-pc-windows-msvc" ]]; then
        check_xwin || return 1
        PATH="$(xwin_path_prefix)" RUSTFLAGS="$flags" \
            cargo xwin build --release --target "$target"
    elif [[ "$use_cross" == "true" ]]; then
        RUSTFLAGS="$flags" cross build --release --target "$target" \
            --manifest-path "$WORKSPACE_DIR/Cargo.toml" -p blazediff
    else
        RUSTFLAGS="$flags" cargo build --release --target "$target"
    fi

    local ext=""
    [[ "$target" == *windows* ]] && ext=".exe"

    local src="$TARGET_DIR/$target/release/blazediff${ext}"
    local dst="$DIST_DIR/${output_name}${ext}"
    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        chmod +x "$dst"
        echo "  -> $dst ($(ls -lh "$dst" | awk '{print $5}'))"
    else
        echo "  Error: Binary not found at $src"
        return 1
    fi
}

build_native() {
    echo "Building native release (optimized for this CPU)..."
    RUSTFLAGS="-C target-cpu=native" cargo build --release
    mkdir -p "$DIST_DIR"

    local os arch ext=""
    os="$(host_os)"
    arch="$(host_arch)"
    [[ "$os" == "windows" ]] && ext=".exe"

    local src="$TARGET_DIR/release/blazediff${ext}"
    local dst="$DIST_DIR/blazediff-${os}-${arch}${ext}"
    cp "$src" "$dst"
    chmod +x "$dst"
    echo "Built: $dst ($(ls -lh "$dst" | awk '{print $5}'))"
}

sync_binaries_to_packages() {
    echo ""
    echo "Syncing CLI binaries to platform packages..."
    local synced=0
    for binary in "$DIST_DIR"/blazediff-*; do
        [[ -f "$binary" ]] || continue
        local name; name=$(basename "$binary")
        # Skip non-CLI artifacts (.node files / wheels)
        [[ "$name" == *.node || "$name" == *.whl ]] && continue

        local target=""
        case "$name" in
            blazediff-macos-arm64)        target="aarch64-apple-darwin" ;;
            blazediff-macos-x64)          target="x86_64-apple-darwin" ;;
            blazediff-linux-arm64)        target="aarch64-unknown-linux-gnu" ;;
            blazediff-linux-x64)          target="x86_64-unknown-linux-gnu" ;;
            blazediff-windows-arm64.exe)  target="aarch64-pc-windows-msvc" ;;
            blazediff-windows-x64.exe)    target="x86_64-pc-windows-msvc" ;;
            *) continue ;;
        esac

        local pkg_name; pkg_name=$(get_package_name "$target")
        local pkg_dir="$PACKAGES_DIR/$pkg_name"
        if [[ -n "$pkg_name" && -d "$pkg_dir" ]]; then
            local out="blazediff"
            [[ "$name" == *.exe ]] && out="blazediff.exe"
            cp "$binary" "$pkg_dir/$out"
            [[ "$out" != *.exe ]] || true
            chmod +x "$pkg_dir/$out"
            echo "  -> $pkg_dir/$out"
            synced=$((synced + 1))
        fi
    done
    [[ $synced -gt 0 ]] && echo "Synced $synced CLI binaries." || echo "  No CLI binaries to sync."
}

# Forward the same target scope to a sibling builder script.
delegate() {
    local script="$1"
    local mode="$2"
    local target="${3:-}"
    case "$mode" in
        native) "$SCRIPT_DIR/$script" --native ;;
        macos)  "$SCRIPT_DIR/$script" --macos ;;
        all)    "$SCRIPT_DIR/$script" --all ;;
        target) "$SCRIPT_DIR/$script" --target "$target" ;;
    esac
}

# Parse args
MODE="native"
SPECIFIC_TARGET=""
BUILD_NAPI="false"
BUILD_MATURIN="false"
BUILD_WASM="false"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)   MODE="target"; SPECIFIC_TARGET="$2"; shift 2 ;;
        --native)   MODE="native"; shift ;;
        --macos)    MODE="macos";  shift ;;
        --all)      MODE="all";    shift ;;
        --napi)     BUILD_NAPI="true";    shift ;;
        --maturin)  BUILD_MATURIN="true"; shift ;;
        --wasm)     BUILD_WASM="true";    shift ;;
        --list)
            echo "Supported targets:"
            for t in "${DEFAULT_TARGETS_NAPI[@]}"; do
                printf "  %-32s -> %s\n" "$t" "$(get_friendly_name "$t")"
            done
            exit 0
            ;;
        --help|-h)  print_usage; exit 0 ;;
        *)          echo "Unknown option: $1"; print_usage; exit 1 ;;
    esac
done

cd "$PROJECT_DIR"

case "$MODE" in
    native)
        build_native
        ;;
    macos)
        echo "Building macOS binaries..."
        rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null || true
        build_target aarch64-apple-darwin false
        build_target x86_64-apple-darwin   false
        ;;
    target)
        host=$(current_target_triple)
        if [[ "$SPECIFIC_TARGET" == "$host" ]]; then
            build_target "$SPECIFIC_TARGET" false
        elif [[ "$(uname -s)" == "Darwin" && "$SPECIFIC_TARGET" == *"apple-darwin"* ]]; then
            rustup target add "$SPECIFIC_TARGET" 2>/dev/null || true
            build_target "$SPECIFIC_TARGET" false
        elif [[ "$SPECIFIC_TARGET" == *"-pc-windows-msvc" ]]; then
            rustup target add "$SPECIFIC_TARGET" 2>/dev/null || true
            build_target "$SPECIFIC_TARGET" false
        else
            check_cross
            build_target "$SPECIFIC_TARGET" true
        fi
        ;;
    all)
        echo "Building all platforms..."
        host=$(current_target_triple)
        has_cross=false
        command -v cross &> /dev/null && has_cross=true

        for target in "${DEFAULT_TARGETS_NAPI[@]}"; do
            if [[ "$target" == "$host" ]]; then
                build_target "$target" false || echo "  Skipped $target"
            elif [[ "$(uname -s)" == "Darwin" && "$target" == *"apple-darwin"* ]]; then
                rustup target add "$target" 2>/dev/null || true
                build_target "$target" false || echo "  Skipped $target"
            elif [[ "$target" == *"-pc-windows-msvc" ]]; then
                rustup target add "$target" 2>/dev/null || true
                build_target "$target" false || echo "  Skipped $target"
            elif [[ "$has_cross" == "true" ]]; then
                build_target "$target" true || echo "  Skipped $target"
            else
                echo "Skipping $target (requires cross)"
            fi
            echo ""
        done
        ;;
esac

sync_binaries_to_packages

if [[ "$BUILD_NAPI" == "true" ]]; then
    echo ""
    echo "==> Delegating N-API build to build-napi.sh"
    delegate build-napi.sh "$MODE" "$SPECIFIC_TARGET"
fi

if [[ "$BUILD_MATURIN" == "true" ]]; then
    echo ""
    echo "==> Delegating Python wheel build to build-maturin.sh"
    delegate build-maturin.sh "$MODE" "$SPECIFIC_TARGET"
fi

if [[ "$BUILD_WASM" == "true" ]]; then
    echo ""
    echo "==> Delegating wasm build to build-wasm.sh"
    "$SCRIPT_DIR/build-wasm.sh"
fi
