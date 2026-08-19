#!/usr/bin/env bash
# Shared helpers sourced by build-all.sh, build-napi.sh, build-maturin.sh and
# build-wasm.sh, for every crate that ships a binary artifact.
# Defines target tables, host detection, RUSTFLAGS profiles, and prereq checks.
# Not meant to run directly.

# Resolve repo paths from the crate being built.
# Caller must set CRATE_DIR (absolute path of the crate) before sourcing.
: "${CRATE_DIR:?CRATE_DIR must be set before sourcing _targets.sh}"
PROJECT_DIR="$CRATE_DIR"                        # crates/<crate>
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

# Target triple -> platform-package directory name.
# $2 is the package family prefix: "core-native" for blazediff, "ssim-native"
# for blazediff-ssim. Defaults to core-native so existing callers are unchanged.
get_package_name() {
    local prefix="${2:-core-native}"
    case "$1" in
        aarch64-apple-darwin) echo "${prefix}-darwin-arm64" ;;
        x86_64-apple-darwin) echo "${prefix}-darwin-x64" ;;
        aarch64-unknown-linux-gnu) echo "${prefix}-linux-arm64" ;;
        x86_64-unknown-linux-gnu) echo "${prefix}-linux-x64" ;;
        x86_64-pc-windows-msvc|x86_64-pc-windows-gnu) echo "${prefix}-win32-x64" ;;
        aarch64-pc-windows-msvc|aarch64-pc-windows-gnu) echo "${prefix}-win32-arm64" ;;
        *) echo "" ;;
    esac
}

# Target triple -> absolute platform-package directory. Each family lives in
# packages/<prefix>/, alongside the wrapper package of the same name, so the
# family prefix doubles as the group folder. Empty for an unmapped triple.
get_package_dir() {
    local prefix="${2:-core-native}"
    local name; name=$(get_package_name "$1" "$prefix")
    [[ -z "$name" ]] && return 0
    echo "$PACKAGES_DIR/$prefix/$name"
}

# libdeflate-sys compiles its full x86 runtime-dispatch table, including the
# AVX-512 adler32 path, regardless of -C target-cpu. zig (cross-linker for our
# Linux/Windows wheels) bundles clang 18+, which gates 512-bit intrinsics behind
# the `evex512` ABI feature. libdeflate's vendored source enables avx512vnni via
# a function target attribute but not evex512, so that clang rejects it:
#   "_mm512_loadu_si512 requires target feature 'evex512' ... changes the ABI"
# Enabling evex512 for the C TUs on the x86_64 Linux triple unblocks the build.
# Namespaced to the triple, so other targets (and native macOS clang) are
# untouched. Only matters for zig cross-builds, which is how every wheel is made.
#
# Set BLAZEDIFF_SKIP_EVEX512=1 when compiling this triple *natively* with GCC:
# the flag only exists in GCC 14+, so on e.g. Ubuntu 24.04 (gcc 13) every C TU
# fails with "unrecognized command-line option '-mevex512'". Since the flag is
# only needed to appease zig's clang, dropping it for a native build is safe.
if [[ "${BLAZEDIFF_SKIP_EVEX512:-0}" != "1" ]]; then
    export CFLAGS_x86_64_unknown_linux_gnu="${CFLAGS_x86_64_unknown_linux_gnu:-} -mevex512"
fi

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

# Should a target be routed through `cross` even though it matches the host?
# Only ever true for linux-gnu, and only when BLAZEDIFF_FORCE_CROSS=1.
#
# The build scripts short-circuit to a plain `cargo build` when target == host,
# which is right on a developer machine but wrong in CI: build-artifacts.yml
# builds the Linux binaries on ubuntu-latest, where a native build would link
# against the runner's glibc (2.39) and raise the floor for every user from the
# 2.18 that cross's images produce. Set the env var there, nowhere else.
force_cross() {
    [[ "${BLAZEDIFF_FORCE_CROSS:-0}" == "1" && "$1" == *-unknown-linux-* ]]
}

# Does a Windows MSVC target have to be cross-built with cargo-xwin?
#
# Only when the host isn't Windows. On a developer's Mac it always is, which is
# why the scripts used to assume it unconditionally; build-artifacts.yml builds
# these targets on a Windows runner, where the MSVC toolchain and the Windows
# SDK are already installed. There a plain `cargo build` skips cargo-xwin's
# ~1 GB CRT download entirely and links with the real MSVC toolchain rather
# than clang-cl. `OS` is set to Windows_NT by Windows itself and survives into
# git-bash, which is what `shell: bash` runs on the runner.
needs_xwin() {
    [[ "$1" == *-pc-windows-msvc && "${OS:-}" != "Windows_NT" ]]
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
    x86_64-pc-windows-msvc
    aarch64-pc-windows-msvc
)
