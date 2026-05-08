#!/usr/bin/env bash
# Shared helpers sourced by build-all.sh, build-napi.sh, build-maturin.sh.
# Defines target tables, host detection, RUSTFLAGS profiles, and prereq checks.
# Not meant to run directly.

# Resolve repo paths relative to the calling script.
# Caller should set SCRIPT_DIR before sourcing.
: "${SCRIPT_DIR:?SCRIPT_DIR must be set before sourcing _targets.sh}"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"          # crates/blazediff
WORKSPACE_DIR="$(dirname "$PROJECT_DIR")"       # crates/
ROOT_DIR="$(dirname "$WORKSPACE_DIR")"          # repo root
TARGET_DIR="$WORKSPACE_DIR/target"              # workspace target
DIST_DIR="$PROJECT_DIR/dist"
PACKAGES_DIR="$ROOT_DIR/packages"

# Target triple -> friendly name (bash 3.2 compatible)
get_friendly_name() {
    case "$1" in
        aarch64-apple-darwin) echo "macos-arm64" ;;
        x86_64-apple-darwin) echo "macos-x64" ;;
        aarch64-unknown-linux-gnu) echo "linux-arm64" ;;
        x86_64-unknown-linux-gnu) echo "linux-x64" ;;
        aarch64-unknown-linux-musl) echo "linux-arm64-musl" ;;
        x86_64-unknown-linux-musl) echo "linux-x64-musl" ;;
        x86_64-pc-windows-msvc|x86_64-pc-windows-gnu) echo "windows-x64" ;;
        aarch64-pc-windows-msvc|aarch64-pc-windows-gnu) echo "windows-arm64" ;;
        *) echo "$1" ;;
    esac
}

# Target triple -> NAPI platform-package directory name (under packages/)
get_package_name() {
    case "$1" in
        aarch64-apple-darwin) echo "core-native-darwin-arm64" ;;
        x86_64-apple-darwin) echo "core-native-darwin-x64" ;;
        aarch64-unknown-linux-gnu) echo "core-native-linux-arm64" ;;
        x86_64-unknown-linux-gnu) echo "core-native-linux-x64" ;;
        x86_64-pc-windows-msvc|x86_64-pc-windows-gnu) echo "core-native-win32-x64" ;;
        aarch64-pc-windows-msvc|aarch64-pc-windows-gnu) echo "core-native-win32-arm64" ;;
        *) echo "" ;;
    esac
}

# RUSTFLAGS per target for distribution (optimized but compatible)
get_rustflags() {
    case "$1" in
        aarch64-apple-darwin)       echo "-C target-cpu=apple-m1" ;;
        x86_64-apple-darwin)        echo "-C target-cpu=haswell" ;;
        aarch64-unknown-linux-*)    echo "-C target-cpu=cortex-a72" ;;
        x86_64-unknown-linux-*|x86_64-pc-windows-*) echo "-C target-cpu=haswell" ;;
        *)                          echo "" ;;
    esac
}

current_target_triple() {
    rustc -vV | grep '^host:' | awk '{print $2}'
}

host_os() {
    case "$(uname -s)" in
        Darwin) echo "macos" ;;
        Linux)  echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *) echo "unknown" ;;
    esac
}

host_arch() {
    case "$(uname -m)" in
        arm64|aarch64) echo "arm64" ;;
        x86_64|amd64)  echo "x64" ;;
        *) echo "unknown" ;;
    esac
}

check_cross() {
    if ! command -v cross &> /dev/null; then
        echo "Error: 'cross' is required for cross-compilation"
        echo "Install with: cargo install cross"
        exit 1
    fi
}

check_xwin() {
    if ! command -v cargo-xwin &> /dev/null; then
        echo "Error: 'cargo-xwin' is required for Windows MSVC targets"
        echo "Install with: cargo install cargo-xwin"
        return 1
    fi
}

# llvm path for cargo-xwin (homebrew on macOS)
xwin_path_prefix() {
    if [[ -d "/opt/homebrew/opt/llvm/bin" ]]; then
        echo "/opt/homebrew/opt/llvm/bin:$PATH"
    else
        echo "$PATH"
    fi
}

# Default target list shared by both NAPI and CLI builds.
# Maturin overrides this in build-maturin.sh (uses MSVC for Windows).
DEFAULT_TARGETS_NAPI=(
    aarch64-apple-darwin
    x86_64-apple-darwin
    aarch64-unknown-linux-gnu
    x86_64-unknown-linux-gnu
    x86_64-pc-windows-gnu
    aarch64-pc-windows-msvc
)
