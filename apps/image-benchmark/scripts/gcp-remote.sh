#!/usr/bin/env bash
# Runs on the Google Cloud VM that gcp.sh creates. Mirrors the build steps of
# .github/workflows/benchmark-*.yml, then runs each key through `pnpm benchmark`.
#
# Usage: gcp-remote.sh <repo-url> <sha> <key,key,...> [args forwarded to pnpm benchmark]

set -euo pipefail

REPO_URL="$1"
SHA="$2"
IFS=, read -r -a KEYS <<<"$3"
shift 3
FORWARDED=("$@")

WORKDIR="$HOME/blazediff"
WASM_BINDGEN_VERSION=0.2.100

echo "==> System packages"
# Ubuntu mirrors sometimes serve a half-synced index for a minute.
for attempt in 1 2 3 4 5; do
	sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 update -qq && break
	if [ "$attempt" -eq 5 ]; then exit 1; fi
	sleep 30
done
sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y -qq \
	build-essential pkg-config cmake zlib1g-dev nasm binaryen git git-lfs curl unzip

echo "==> Rust"
curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --target wasm32-unknown-unknown
# shellcheck source=/dev/null
source "$HOME/.cargo/env"
cargo install wasm-bindgen-cli --version "$WASM_BINDGEN_VERSION" --locked

echo "==> Source at $SHA"
git lfs install --skip-repo
git clone --recurse-submodules "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"
git checkout --quiet "$SHA"
git submodule update --init --recursive
git lfs pull

echo "==> Node"
curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"
fnm install "$(cat .node-version)"
fnm use "$(cat .node-version)"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
pnpm install --frozen-lockfile

echo "==> Build from source"
# The committed binaries are release artifacts and lag the source; removing them
# means the run measures this commit or fails.
rm -f packages/core-native/core-native-*/blazediff packages/core-native/core-native-*/blazediff.node
rm -f packages/core-wasm/wasm/blazediff_bg.wasm packages/core-wasm/wasm/blazediff.js
HOST=$(rustc -vV | awk '/^host:/{print $2}')
BLAZEDIFF_SKIP_EVEX512=1 ./crates/blazediff/scripts/build-all.sh --target "$HOST" --napi
pnpm build:wasm
pnpm build

(cd apps/image-benchmark && node -e '
	const { hasNativeBinding } = require("@blazediff/core-native");
	if (!hasNativeBinding()) {
		console.error("native binding not loadable; benchmark would fall back to JS");
		process.exit(1);
	}
')

# A failed key must not ship back the committed artifact as if it were fresh.
RESULTS_DIR="benchmarks/results/linux-$(node -p process.arch)"
for key in "${KEYS[@]}"; do rm -f "$RESULTS_DIR/$key.json"; done

case "$(uname -m)" in
x86_64) CODEC_RUSTFLAGS="-C target-cpu=haswell" ;;
aarch64) CODEC_RUSTFLAGS="-C target-cpu=cortex-a72" ;;
*) CODEC_RUSTFLAGS="" ;;
esac

failed=()
for key in "${KEYS[@]}"; do
	echo "==> pnpm benchmark $key"
	case "$key" in
	png | ssim-dssim) env RUSTFLAGS="$CODEC_RUSTFLAGS" pnpm benchmark "$key" "${FORWARDED[@]}" || failed+=("$key") ;;
	*) pnpm benchmark "$key" "${FORWARDED[@]}" || failed+=("$key") ;;
	esac
done

# Only what this run wrote, so unselected keys never overwrite local results.
results=()
for key in "${KEYS[@]}"; do
	if [ -f "$RESULTS_DIR/$key.json" ]; then results+=("$RESULTS_DIR/$key.json"); fi
done
tar czf "$HOME/benchmarks.tgz" benchmarks/*.md ${results[@]+"${results[@]}"}

if [ ${#failed[@]} -gt 0 ]; then
	echo "Failed keys: ${failed[*]}" >&2
	exit 1
fi
