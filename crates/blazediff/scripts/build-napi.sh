#!/usr/bin/env bash
set -euo pipefail

# Build N-API .node files for blazediff.
# Outputs to crates/blazediff/dist/ and syncs to packages/core-native-{platform}/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

print_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Build N-API .node files via napi-rs (cargo build --features napi --lib).

Options:
  --target <TARGET>  Build for specific target triple
  --native           Build for the current host (target-cpu=native)
  --macos            Build both macOS targets (arm64 + x64)
  --all              Build all supported platforms
  --no-sync          Do not sync .node files into packages/core-native-*
  --help             Show this help

Output: \$DIST_DIR/blazediff-{os}-{arch}.node
Sync:   packages/core-native-{platform}/blazediff.node
EOF
}

build_native_napi() {
    echo "Building native N-API release (optimized for this CPU)..."
    RUSTFLAGS="-C target-cpu=native" cargo build --release --features napi --lib

    mkdir -p "$DIST_DIR"
    local os arch
    os="$(host_os)"
    arch="$(host_arch)"

    local lib_ext="" lib_prefix="lib"
    case "$os" in
        windows) lib_ext=".dll"; lib_prefix="" ;;
        macos)   lib_ext=".dylib" ;;
        *)       lib_ext=".so" ;;
    esac

    local src="$TARGET_DIR/release/${lib_prefix}blazediff${lib_ext}"
    local dst="$DIST_DIR/blazediff-${os}-${arch}.node"
    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        echo "Built N-API: $dst ($(ls -lh "$dst" | awk '{print $5}'))"
    else
        echo "Warning: N-API library not found at $src"
        return 1
    fi
}

build_napi_target() {
    local target="$1"
    local use_cross="${2:-false}"
    local friendly; friendly=$(get_friendly_name "$target")
    local output_name="blazediff-${friendly}.node"

    echo "Building N-API $output_name ($target)..."
    mkdir -p "$DIST_DIR"
    local flags; flags=$(get_rustflags "$target")

    if [[ "$target" == "aarch64-pc-windows-msvc" ]]; then
        check_xwin || return 1
        PATH="$(xwin_path_prefix)" RUSTFLAGS="$flags" \
            cargo xwin build --release --target "$target" --features napi --lib
    elif [[ "$use_cross" == "true" ]]; then
        RUSTFLAGS="$flags" cross build --release --target "$target" \
            --manifest-path "$WORKSPACE_DIR/Cargo.toml" -p blazediff --features napi --lib
    else
        RUSTFLAGS="$flags" cargo build --release --target "$target" --features napi --lib
    fi

    local lib_ext="" lib_prefix="lib"
    case "$target" in
        *windows*) lib_ext=".dll"; lib_prefix="" ;;
        *darwin*)  lib_ext=".dylib" ;;
        *)         lib_ext=".so" ;;
    esac

    local src="$TARGET_DIR/$target/release/${lib_prefix}blazediff${lib_ext}"
    local dst="$DIST_DIR/${output_name}"
    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        echo "  -> $dst ($(ls -lh "$dst" | awk '{print $5}'))"
    else
        echo "  Warning: N-API library not found at $src"
        return 1
    fi
}

sync_napi_to_packages() {
    echo ""
    echo "Syncing .node files to platform packages..."
    local synced=0
    for binary in "$DIST_DIR"/blazediff-*.node; do
        [[ -f "$binary" ]] || continue
        local name; name=$(basename "$binary")
        local target=""
        case "$name" in
            blazediff-macos-arm64.node) target="aarch64-apple-darwin" ;;
            blazediff-macos-x64.node)   target="x86_64-apple-darwin" ;;
            blazediff-linux-arm64.node) target="aarch64-unknown-linux-gnu" ;;
            blazediff-linux-x64.node)   target="x86_64-unknown-linux-gnu" ;;
            blazediff-windows-arm64.node) target="aarch64-pc-windows-msvc" ;;
            blazediff-windows-x64.node)   target="x86_64-pc-windows-gnu" ;;
            *) continue ;;
        esac
        local pkg_name; pkg_name=$(get_package_name "$target")
        local pkg_dir="$PACKAGES_DIR/$pkg_name"
        if [[ -n "$pkg_name" && -d "$pkg_dir" ]]; then
            cp "$binary" "$pkg_dir/blazediff.node"
            echo "  -> $pkg_dir/blazediff.node"
            synced=$((synced + 1))
        fi
    done
    [[ $synced -gt 0 ]] && echo "Synced $synced .node files." || echo "  No .node files to sync."
}

# Parse args
MODE="native"
SPECIFIC_TARGET=""
DO_SYNC="true"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)   MODE="target"; SPECIFIC_TARGET="$2"; shift 2 ;;
        --native)   MODE="native"; shift ;;
        --macos)    MODE="macos";  shift ;;
        --all)      MODE="all";    shift ;;
        --no-sync)  DO_SYNC="false"; shift ;;
        --help|-h)  print_usage; exit 0 ;;
        *)          echo "Unknown option: $1"; print_usage; exit 1 ;;
    esac
done

cd "$PROJECT_DIR"

case "$MODE" in
    native)
        build_native_napi
        ;;
    macos)
        rustup target add aarch64-apple-darwin x86_64-apple-darwin 2>/dev/null || true
        build_napi_target aarch64-apple-darwin false || true
        build_napi_target x86_64-apple-darwin   false || true
        ;;
    target)
        host=$(current_target_triple)
        if [[ "$SPECIFIC_TARGET" == "$host" ]]; then
            build_napi_target "$SPECIFIC_TARGET" false
        elif [[ "$(uname -s)" == "Darwin" && "$SPECIFIC_TARGET" == *"apple-darwin"* ]]; then
            rustup target add "$SPECIFIC_TARGET" 2>/dev/null || true
            build_napi_target "$SPECIFIC_TARGET" false
        elif [[ "$SPECIFIC_TARGET" == "aarch64-pc-windows-msvc" ]]; then
            rustup target add "$SPECIFIC_TARGET" 2>/dev/null || true
            build_napi_target "$SPECIFIC_TARGET" false
        else
            check_cross
            build_napi_target "$SPECIFIC_TARGET" true
        fi
        ;;
    all)
        host=$(current_target_triple)
        has_cross=false
        command -v cross &> /dev/null && has_cross=true

        for target in "${DEFAULT_TARGETS_NAPI[@]}"; do
            if [[ "$target" == "$host" ]]; then
                build_napi_target "$target" false || echo "  Skipped $target"
            elif [[ "$(uname -s)" == "Darwin" && "$target" == *"apple-darwin"* ]]; then
                rustup target add "$target" 2>/dev/null || true
                build_napi_target "$target" false || echo "  Skipped $target"
            elif [[ "$target" == "aarch64-pc-windows-msvc" ]]; then
                rustup target add "$target" 2>/dev/null || true
                build_napi_target "$target" false || echo "  Skipped $target"
            elif [[ "$has_cross" == "true" ]]; then
                build_napi_target "$target" true || echo "  Skipped $target"
            else
                echo "Skipping $target (requires cross)"
            fi
            echo ""
        done
        ;;
esac

if [[ "$DO_SYNC" == "true" ]]; then
    sync_napi_to_packages
fi
