#!/usr/bin/env bash
set -euo pipefail

# Build Python wheel(s) via maturin (PyO3 bindings) for a crate that exposes a
# `python` feature and carries a pyproject.toml.
#
# Driven by one variable, so blazediff, blazediff-ssim and blazediff-interpret
# share this script instead of keeping three copies of the cross/zig/xwin
# matrix. Each crate's scripts/build-maturin.sh sets it and execs this:
#
#   CRATE_DIR  absolute path of the crate    e.g. .../crates/blazediff-ssim
#
# Everything else — the distribution name, the wheel filename prefix, the
# version — is read from that crate's pyproject.toml, which is already the
# source of truth maturin itself uses.
: "${CRATE_DIR:?CRATE_DIR must be set before running build-maturin.sh}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

# Isolate the maturin cdylib target dir from the napi build. See build-napi.sh
# for the full reasoning - sharing target/<triple>/release/libblazediff.so
# between the python and napi feature sets has shipped python-tainted .node
# files in the past.
export CARGO_TARGET_DIR="$TARGET_DIR/maturin"

# dist/wheels/ - transient build output (gitignored).
# <crate>/wheels/ - committed source of truth that CI publishes from.
WHEELS_DIR="$DIST_DIR/wheels"
COMMITTED_WHEELS_DIR="$PROJECT_DIR/wheels"

PYPROJECT="$PROJECT_DIR/pyproject.toml"
[[ -f "$PYPROJECT" ]] || { echo "Error: no pyproject.toml at $PYPROJECT"; exit 1; }

# PEP 427 escapes the distribution name in the wheel filename, which here only
# means hyphens become underscores.
DIST_NAME="$(sed -nE 's/^name *= *"([^"]+)".*/\1/p' "$PYPROJECT" | head -1)"
[[ -n "$DIST_NAME" ]] || { echo "Error: could not read name from $PYPROJECT"; exit 1; }
WHEEL_PREFIX="${DIST_NAME//-/_}"

print_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Build Python wheels via maturin (\`maturin build --features python\`).

Options:
  --target <TARGET>  Build for specific target triple
  --native           Build for the current host (default)
  --macos            Build both macOS targets (arm64 + x64)
  --all              Build all supported platforms
  --develop          Install editable into the active venv (skips wheel build)
  --no-sync          Do not sync wheels into $COMMITTED_WHEELS_DIR
  --version <X.Y.Z>  Assert pyproject.toml is at this version before building.
                     Guards against shipping wheels whose filename version
                     drifts from the release being cut.
  --help             Show this help

Output: \$WHEELS_DIR/${WHEEL_PREFIX}-{version}-cp38-abi3-{platform}.whl

Prereqs:
  - maturin (\`uv tool install maturin\` or \`pipx install maturin\`)
  - Linux cross targets: ziglang (\`pip install ziglang\`) or 'cross'
  - Windows cross targets: cargo-xwin (\`cargo install cargo-xwin\`)
EOF
}

if ! command -v maturin &> /dev/null; then
    echo "Error: 'maturin' is required."
    echo "Install with: uv tool install maturin   (or)   pipx install maturin"
    exit 1
fi

# rustc 1.98 started passing `-Wl,--fix-cortex-a53-843419` when linking
# aarch64-linux, and `zig cc` rejects linker args it doesn't recognise.
# cargo-zigbuild 0.23 filters it (rust-cross/cargo-zigbuild#452); maturin 1.14.1
# is the first release to bundle that. Below it, the Linux arm64 wheel dies
# three minutes into a link with `error: unsupported linker arg`, which names
# neither maturin nor the toolchain that moved.
MIN_MATURIN="1.14.1"
MATURIN_VERSION="$(maturin --version | awk '{print $2}')"
if [[ "$(printf '%s\n%s\n' "$MIN_MATURIN" "$MATURIN_VERSION" | sort -V | head -1)" != "$MIN_MATURIN" ]]; then
    echo "Error: maturin $MATURIN_VERSION is too old; $MIN_MATURIN or newer is required."
    echo "Upgrade with: uv tool install maturin --force"
    exit 1
fi

# Maturin's default Windows target uses MSVC ABI (Python on Windows is MSVC-built).
DEFAULT_TARGETS_MATURIN=(
    aarch64-apple-darwin
    x86_64-apple-darwin
    aarch64-unknown-linux-gnu
    x86_64-unknown-linux-gnu
    x86_64-pc-windows-msvc
    aarch64-pc-windows-msvc
)

run_maturin_native() {
    echo "Building native wheel (target-cpu=native)..."
    mkdir -p "$WHEELS_DIR"
    RUSTFLAGS="-C target-cpu=native" \
        maturin build --release --features python --out "$WHEELS_DIR"
}

# Build wheel for a specific target. Strategy:
#   - macOS targets: maturin native (rustup adds the std)
#   - Linux targets: maturin --zig (zig as cross-linker, manylinux-friendly)
#   - Windows MSVC: maturin --zig also works, but cargo-xwin is the established path here
run_maturin_target() {
    local target="$1"
    echo "Building wheel for $target..."
    mkdir -p "$WHEELS_DIR"
    local flags; flags=$(get_rustflags "$target")

    case "$target" in
        *apple-darwin)
            rustup target add "$target" 2>/dev/null || true
            RUSTFLAGS="$flags" \
                maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
            ;;
        *unknown-linux-*)
            rustup target add "$target" 2>/dev/null || true
            local has_zig="false"
            if command -v zig &> /dev/null; then
                has_zig="true"
            elif python3 -c "import ziglang" &> /dev/null || python -c "import ziglang" &> /dev/null; then
                has_zig="true"
            fi
            if [[ "$has_zig" == "false" ]]; then
                echo "  Warning: zig not found - install with: brew install zig (or pip install ziglang)"
                echo "  Falling back to plain maturin build (wheel will be tagged linux_*, not manylinux)."
                RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
            else
                RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --zig --out "$WHEELS_DIR"
            fi
            ;;
        *pc-windows-msvc)
            rustup target add "$target" 2>/dev/null || true
            if needs_xwin "$target"; then
                check_xwin || return 1
                PATH="$(xwin_path_prefix)" RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
            else
                RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
            fi
            ;;
        *)
            echo "  Error: unsupported target for maturin: $target"
            return 1
            ;;
    esac
}

# Parse args
MODE="native"
SPECIFIC_TARGET=""
EXPECTED_VERSION=""
DO_SYNC="true"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)  MODE="target"; SPECIFIC_TARGET="$2"; shift 2 ;;
        --native)  MODE="native"; shift ;;
        --macos)   MODE="macos";  shift ;;
        --all)     MODE="all";    shift ;;
        --develop) MODE="develop"; shift ;;
        --no-sync) DO_SYNC="false"; shift ;;
        --version) EXPECTED_VERSION="$2"; shift 2 ;;
        --help|-h) print_usage; exit 0 ;;
        *)         echo "Unknown option: $1"; print_usage; exit 1 ;;
    esac
done

cd "$PROJECT_DIR"

# Version sanity: read it from pyproject.toml's static `version` (maturin bakes
# this into the wheel filename; sync-pyproject-version.js drives it from the
# crate's changesets shadow). Surface it loudly so a wrong-version build is
# obvious, and let callers assert via --version.
WHEEL_VERSION="$(sed -nE 's/^version *= *"([^"]+)".*/\1/p' "$PYPROJECT" | head -1)"
if [[ -z "$WHEEL_VERSION" ]]; then
    echo "Error: could not read version from $PYPROJECT"
    exit 1
fi
if [[ -n "$EXPECTED_VERSION" && "$EXPECTED_VERSION" != "$WHEEL_VERSION" ]]; then
    echo "Error: --version $EXPECTED_VERSION does not match pyproject.toml ($WHEEL_VERSION)."
    echo "       Bump it (e.g. \`node scripts/release/sync-pyproject-version.js\`) or correct the --version flag before building."
    exit 1
fi
echo "==> Building wheels for $DIST_NAME v$WHEEL_VERSION (from pyproject.toml)"

# Wipe stale wheels from prior runs so $WHEELS_DIR only contains wheels from
# this build - otherwise older versions linger and get synced into the committed
# dir alongside the current version, breaking CI's single-version invariant.
if [[ "$MODE" != "develop" ]]; then
    mkdir -p "$WHEELS_DIR"
    find "$WHEELS_DIR" -maxdepth 1 -name '*.whl' -delete
fi

case "$MODE" in
    develop)
        if [[ -z "${VIRTUAL_ENV:-}" ]]; then
            echo "Error: --develop requires an active Python venv."
            exit 1
        fi
        echo "==> maturin develop --release --features python"
        maturin develop --release --features python
        ;;
    native)
        run_maturin_native
        ;;
    macos)
        run_maturin_target aarch64-apple-darwin
        run_maturin_target x86_64-apple-darwin
        ;;
    target)
        run_maturin_target "$SPECIFIC_TARGET"
        ;;
    all)
        for target in "${DEFAULT_TARGETS_MATURIN[@]}"; do
            run_maturin_target "$target" || echo "  Skipped $target"
            echo ""
        done
        ;;
esac

echo ""
echo "Built wheels in $WHEELS_DIR:"
ls -1 "$WHEELS_DIR"/*.whl 2>/dev/null || echo "(none)"

# Skip the committed-wheels sync for `develop` mode (no wheel artifacts
# produced) and whenever the caller asked not to - a --native build would
# otherwise replace the committed six-platform set with one host-only wheel,
# which is exactly what scripts/checks/test-python.sh must not do.
if [[ "$MODE" != "develop" && "$DO_SYNC" == "true" ]]; then
    if compgen -G "$WHEELS_DIR/*.whl" > /dev/null; then
        echo ""
        echo "==> Syncing wheels to committed source of truth: $COMMITTED_WHEELS_DIR/"
        mkdir -p "$COMMITTED_WHEELS_DIR"
        # Drop stale wheels (different version, partial set, etc.) before syncing
        # so the committed dir always reflects the latest build.
        find "$COMMITTED_WHEELS_DIR" -maxdepth 1 -name '*.whl' -delete
        cp "$WHEELS_DIR"/*.whl "$COMMITTED_WHEELS_DIR/"
        echo "Synced $(ls -1 "$COMMITTED_WHEELS_DIR"/*.whl | wc -l | tr -d ' ') wheel(s)."
    fi
fi
