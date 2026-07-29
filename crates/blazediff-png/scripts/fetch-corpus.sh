#!/usr/bin/env bash
# Fetch a large, diverse real-world PNG corpus for the spng differential
# harness (tests/corpus_differential.rs). Idempotent: re-runs skip anything
# already present. Nothing here is committed — the target dir is gitignored.
#
#   ./scripts/fetch-corpus.sh [DEST]     # DEST defaults to <crate>/.corpus
#   BLAZEDIFF_PNG_CORPUS="$DEST" cargo test -p blazediff-png --test corpus_differential
#
# Sources (all public, lossless PNG):
#   - Urban100 / BSD100 / Set14 / Set5  real high-res 8-bit RGB photos (HF)
#   - PngSuite (Willem van Schaik)       every format corner + malformed files
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$CRATE_DIR/.corpus}"
mkdir -p "$DEST"
cd "$DEST"

fetch_hf_sr() {  # name -> data/<name>_HR.tar.gz
  local name="$1"
  if [ -d "$name" ] && [ -n "$(find "$name" -name '*.png' -print -quit 2>/dev/null)" ]; then
    echo "  $name: present ($(find "$name" -name '*.png' | wc -l | tr -d ' ') png), skipping"
    return
  fi
  echo "  $name: downloading..."
  curl -fsSL --retry 3 --max-time 600 \
    "https://huggingface.co/datasets/eugenesiow/$name/resolve/main/data/${name}_HR.tar.gz" \
    -o "$name.tar.gz"
  mkdir -p "$name"
  tar -xzf "$name.tar.gz" -C "$name"
  rm -f "$name.tar.gz"
  echo "  $name: $(find "$name" -name '*.png' | wc -l | tr -d ' ') png"
}

echo "Fetching PNG corpus into $DEST"
for ds in Urban100 BSD100 Set14 Set5; do fetch_hf_sr "$ds"; done

if [ -d pngsuite ] && [ -n "$(find pngsuite -name '*.png' -print -quit 2>/dev/null)" ]; then
  echo "  pngsuite: present, skipping"
else
  echo "  pngsuite: downloading..."
  curl -fsSL --retry 3 --max-time 120 \
    "http://www.schaik.com/pngsuite/PngSuite-2017jul19.zip" -o pngsuite.zip
  mkdir -p pngsuite && (cd pngsuite && unzip -oq ../pngsuite.zip)
  rm -f pngsuite.zip
  echo "  pngsuite: $(find pngsuite -name '*.png' | wc -l | tr -d ' ') png"
fi

echo "Done. $(find "$DEST" -name '*.png' | wc -l | tr -d ' ') PNG files total."
echo "Run:  BLAZEDIFF_PNG_CORPUS=\"$DEST\" cargo test -p blazediff-png --test corpus_differential -- --nocapture"
