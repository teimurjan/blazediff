#!/usr/bin/env bash
set -euo pipefail

# Cross-platform release build script for blazediff
# Outputs binaries to dist/ directory with odiff-compatible naming

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"

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

# RUSTFLAGS per target for distribution (optimized but compatible)
get_rustflags() {
    case "$1" in
        aarch64-apple-darwin)
            echo "-C target-cpu=apple-m1" ;;
        x86_64-apple-darwin)
            echo "-C target-cpu=haswell" ;;
        aarch64-unknown-linux-*)
            echo "-C target-cpu=cortex-a72" ;;
        x86_64-unknown-linux-*|x86_64-pc-windows-*)
            echo "-C target-cpu=haswell" ;;
        *)
            echo "" ;;
    esac
}

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --target <TARGET>  Build for specific target"
    echo "  --native           Build for current platform (optimized for this CPU)"
    echo "  --macos            Build both macOS targets (arm64 + x64)"
    echo "  --all              Build all platforms (requires cross)"
    echo "  --list             List supported targets"
    echo "  --help             Show this help"
    echo ""
    echo "Output naming: blazediff-{os}-{arch}[.exe]"
    echo "Example: blazediff-macos-arm64, blazediff-linux-x64, blazediff-windows-x64.exe"
}

check_cross() {
    if ! command -v cross &> /dev/null; then
        echo "Error: 'cross' is required for cross-compilation"
        echo "Install with: cargo install cross"
        echo "Or use --macos to build only macOS targets"
        exit 1
    fi
}

can_build_target() {
    local target="$1"
    rustup target list --installed | grep -q "^${target}$"
}

build_target() {
    local target="$1"
    local use_cross="${2:-false}"
    local friendly_name=$(get_friendly_name "$target")
    local output_name="blazediff-${friendly_name}"

    echo "Building $output_name ($target)..."

    mkdir -p "$DIST_DIR"

    local flags=$(get_rustflags "$target")

    if [[ "$target" == "aarch64-pc-windows-msvc" ]]; then
        # Windows ARM64 requires cargo-xwin with llvm in PATH
        if ! command -v cargo-xwin &> /dev/null; then
            echo "  Error: cargo-xwin required for $target (cargo install cargo-xwin)"
            return 1
        fi
        # Add homebrew llvm to PATH if available
        if [[ -d "/opt/homebrew/opt/llvm/bin" ]]; then
            PATH="/opt/homebrew/opt/llvm/bin:$PATH" RUSTFLAGS="$flags" cargo xwin build --release --target "$target"
        else
            RUSTFLAGS="$flags" cargo xwin build --release --target "$target"
        fi
    elif [[ "$use_cross" == "true" ]]; then
        RUSTFLAGS="$flags" cross build --release --target "$target"
    else
        RUSTFLAGS="$flags" cargo build --release --target "$target"
    fi

    local ext=""
    if [[ "$target" == *"windows"* ]]; then
        ext=".exe"
    fi

    local src="$PROJECT_DIR/target/$target/release/blazediff${ext}"
    local dst="$DIST_DIR/${output_name}${ext}"

    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        chmod +x "$dst"
        local size=$(ls -lh "$dst" | awk '{print $5}')
        echo "  -> $dst ($size)"
    else
        echo "  Error: Binary not found at $src"
        return 1
    fi
}

build_native() {
    echo "Building native release (optimized for this CPU)..."

    RUSTFLAGS="-C target-cpu=native" cargo build --release

    mkdir -p "$DIST_DIR"

    local os arch
    case "$(uname -s)" in
        Darwin) os="macos" ;;
        Linux) os="linux" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) os="unknown" ;;
    esac

    case "$(uname -m)" in
        arm64|aarch64) arch="arm64" ;;
        x86_64|amd64) arch="x64" ;;
        *) arch="unknown" ;;
    esac

    local ext=""
    [[ "$os" == "windows" ]] && ext=".exe"

    local src="$PROJECT_DIR/target/release/blazediff${ext}"
    local dst="$DIST_DIR/blazediff-${os}-${arch}${ext}"

    cp "$src" "$dst"
    chmod +x "$dst"
    local size=$(ls -lh "$dst" | awk '{print $5}')
    echo "Built: $dst ($size)"
}

build_macos() {
    echo "Building macOS binaries..."

    # ARM64
    rustup target add aarch64-apple-darwin 2>/dev/null || true
    build_target "aarch64-apple-darwin" false

    # x64
    rustup target add x86_64-apple-darwin 2>/dev/null || true
    build_target "x86_64-apple-darwin" false

    echo ""
    echo "macOS builds complete:"
    ls -lh "$DIST_DIR"/blazediff-macos-*
}

# Default targets for --all
# Windows x64: MinGW via cross
# Windows ARM64: MSVC via cargo-xwin (requires llvm in PATH)
ALL_TARGETS="aarch64-apple-darwin x86_64-apple-darwin aarch64-unknown-linux-gnu x86_64-unknown-linux-gnu x86_64-pc-windows-gnu aarch64-pc-windows-msvc"

# Parse arguments
MODE="native"
SPECIFIC_TARGET=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            MODE="target"
            SPECIFIC_TARGET="$2"
            shift 2
            ;;
        --native)
            MODE="native"
            shift
            ;;
        --macos)
            MODE="macos"
            shift
            ;;
        --all)
            MODE="all"
            shift
            ;;
        --list)
            echo "Supported targets:"
            echo "  aarch64-apple-darwin -> macos-arm64"
            echo "  x86_64-apple-darwin -> macos-x64"
            echo "  aarch64-unknown-linux-gnu -> linux-arm64"
            echo "  x86_64-unknown-linux-gnu -> linux-x64"
            echo "  aarch64-unknown-linux-musl -> linux-arm64-musl"
            echo "  x86_64-unknown-linux-musl -> linux-x64-musl"
            echo "  x86_64-pc-windows-msvc -> windows-x64"
            echo "  aarch64-pc-windows-msvc -> windows-arm64"
            exit 0
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

cd "$PROJECT_DIR"

case "$MODE" in
    native)
        build_native
        ;;
    macos)
        build_macos
        ;;
    target)
        current_target=$(rustc -vV | grep host | cut -d' ' -f2)
        if [[ "$SPECIFIC_TARGET" == "$current_target" ]]; then
            build_target "$SPECIFIC_TARGET" false
        elif [[ "$(uname -s)" == "Darwin" && "$SPECIFIC_TARGET" == *"apple-darwin"* ]]; then
            rustup target add "$SPECIFIC_TARGET" 2>/dev/null || true
            build_target "$SPECIFIC_TARGET" false
        else
            check_cross
            build_target "$SPECIFIC_TARGET" true
        fi
        ;;
    all)
        echo "Building all platforms..."
        echo "Note: Non-native targets require 'cross' (cargo install cross)"
        echo ""

        current_target=$(rustc -vV | grep host | cut -d' ' -f2)
        has_cross=false
        if command -v cross &> /dev/null; then
            has_cross=true
        fi

        for target in $ALL_TARGETS; do
            # Native target or same-OS target on macOS
            if [[ "$target" == "$current_target" ]]; then
                build_target "$target" false || echo "  Skipped $target"
            elif [[ "$(uname -s)" == "Darwin" && "$target" == *"apple-darwin"* ]]; then
                rustup target add "$target" 2>/dev/null || true
                build_target "$target" false || echo "  Skipped $target"
            elif [[ "$target" == "aarch64-pc-windows-msvc" ]]; then
                # Windows ARM64 uses cargo-xwin, not cross
                rustup target add "$target" 2>/dev/null || true
                build_target "$target" false || echo "  Skipped $target (cargo-xwin failed)"
            elif [[ "$has_cross" == "true" ]]; then
                build_target "$target" true || echo "  Skipped $target (cross-compilation failed)"
            else
                echo "Skipping $target (requires cross)"
            fi
            echo ""
        done

        echo "Builds complete. Available binaries:"
        ls -lh "$DIST_DIR" 2>/dev/null || echo "  No binaries built"
        ;;
esac
