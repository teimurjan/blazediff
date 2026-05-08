#!/usr/bin/env bash
set -euo pipefail

# Build Python wheel(s) for blazediff via maturin (PyO3 bindings).
# Outputs to crates/blazediff/dist/wheels/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_targets.sh
source "$SCRIPT_DIR/_targets.sh"

# dist/wheels/ — transient build output (gitignored).
# crates/blazediff/wheels/ — committed source of truth that CI publishes from.
WHEELS_DIR="$DIST_DIR/wheels"
COMMITTED_WHEELS_DIR="$PROJECT_DIR/wheels"

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
  --help             Show this help

Output: \$WHEELS_DIR/blazediff-{version}-cp38-abi3-{platform}.whl

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
                echo "  Warning: zig not found — install with: brew install zig (or pip install ziglang)"
                echo "  Falling back to plain maturin build (wheel will be tagged linux_*, not manylinux)."
                RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
            else
                RUSTFLAGS="$flags" \
                    maturin build --release --features python --target "$target" --zig --out "$WHEELS_DIR"
            fi
            ;;
        *pc-windows-msvc)
            check_xwin || return 1
            rustup target add "$target" 2>/dev/null || true
            PATH="$(xwin_path_prefix)" RUSTFLAGS="$flags" \
                maturin build --release --features python --target "$target" --out "$WHEELS_DIR"
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

while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)  MODE="target"; SPECIFIC_TARGET="$2"; shift 2 ;;
        --native)  MODE="native"; shift ;;
        --macos)   MODE="macos";  shift ;;
        --all)     MODE="all";    shift ;;
        --develop) MODE="develop"; shift ;;
        --help|-h) print_usage; exit 0 ;;
        *)         echo "Unknown option: $1"; print_usage; exit 1 ;;
    esac
done

cd "$PROJECT_DIR"

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

# Skip the committed-wheels sync for `develop` mode (no wheel artifacts produced).
if [[ "$MODE" != "develop" ]]; then
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
