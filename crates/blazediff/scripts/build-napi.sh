#!/usr/bin/env bash
set -euo pipefail

# Build N-API .node files for blazediff.
# Outputs to crates/blazediff/dist/ and syncs to packages/core-native-{platform}/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

# Isolate the napi cdylib target dir so maturin (python feature) and napi
# can't overwrite each other's libblazediff.so. Both writes land at
# target/<triple>/release/libblazediff.so; sharing it means the last writer
# wins (or worse, cross's host-mounted target/ keeps a stale python-tainted
# .so that the napi rebuild fails to overwrite). Path-isolation kills the
# whole class of bug.
export CARGO_TARGET_DIR="$TARGET_DIR/napi"
TARGET_DIR="$CARGO_TARGET_DIR"

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

# Refuse to ship a .node that links libpython. The python feature uses pyo3
# with extension-module, which leaves undefined PyErr_*/Py_* symbols expected
# to resolve at runtime via a libpython embedding. macOS's dyld lazy-binds
# them and Node loads such a .node fine on darwin; Linux dlopen() rejects it.
# Detect at build time, not at user import time.
check_no_python_symbols() {
    local file="$1"
    command -v strings >/dev/null 2>&1 || return 0
    if strings "$file" 2>/dev/null | grep -qE '^(PyErr_|Py_Initialize$|PyObject_GC_)'; then
        echo "ERROR: $file contains CPython symbols (python feature accidentally enabled)."
        echo "       This .node will fail to dlopen on Linux. Aborting."
        rm -f "$file"
        return 1
    fi
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
        check_no_python_symbols "$dst" || return 1
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

    # Remove any prior artifact for this target before building so a silent
    # cross/xwin failure can't slip a stale .node through sync_napi_to_packages.
    rm -f "$DIST_DIR/${output_name}"

    if [[ "$target" == *"-pc-windows-msvc" ]]; then
        check_xwin || return 1
        PATH="$(xwin_path_prefix)" RUSTFLAGS="$flags" \
            cargo xwin build --release --target "$target" --features napi --lib
    elif [[ "$use_cross" == "true" ]]; then
        # `cross` v0.2.5 only ships linux/amd64 Docker images, so on Apple
        # Silicon the linux-x64/arm64 builds bail with "no match for platform
        # in manifest". Force amd64 emulation (OrbStack/Rosetta handle it).
        #
        # Run from the workspace root so cross mounts it and the relative
        # manifest path resolves inside the container. Passing a host-absolute
        # --manifest-path here fails because the container can't see that path.
        ( cd "$WORKSPACE_DIR" && DOCKER_DEFAULT_PLATFORM=linux/amd64 RUSTFLAGS="$flags" \
            cross build --release --target "$target" \
            -p blazediff --features napi --lib )
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
        check_no_python_symbols "$dst" || return 1
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
            blazediff-windows-x64.node)   target="x86_64-pc-windows-msvc" ;;
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
        elif [[ "$SPECIFIC_TARGET" == *"-pc-windows-msvc" ]]; then
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
            elif [[ "$target" == *"-pc-windows-msvc" ]]; then
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
