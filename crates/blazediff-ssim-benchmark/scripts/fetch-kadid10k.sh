#!/usr/bin/env bash
# Fetch KADID-10k, the subjective-quality dataset the quality harness scores
# against. Idempotent: re-runs skip anything already present. Nothing here is
# committed — the target dir is gitignored.
#
#   ./scripts/fetch-kadid10k.sh [DEST]   # DEST defaults to <crate>/.datasets
#   BLAZEDIFF_MOS_DATASET="$DEST/kadid10k" \
#     cargo run --release -p blazediff-ssim-benchmark --features dssim --bin blazediff-ssim-quality
#
# KADID-10k (Lin, Hosu, Saupe — Konstanz Artificially Distorted Image quality
# Database): 81 reference images x 25 distortion types x 5 levels = 10125
# distorted PNGs, each with a mean opinion score from ~30 crowd workers.
# Chosen over TID2013 because it ships PNG (which blazediff decodes natively)
# and a plain CSV, and because it is larger and more recent.
#
# http://database.mmsp-kn.org/kadid-10k-database.html
# Free for research use; cite the paper if you publish numbers from it.
set -euo pipefail

CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$CRATE_DIR/.datasets}"
ARCHIVE_URL="https://datasets.vqa.mmsp-kn.de/archives/kadid10k.zip"

mkdir -p "$DEST"
cd "$DEST"

if [ -f kadid10k/dmos.csv ] && [ -n "$(find kadid10k/images -name '*.png' -print -quit 2>/dev/null)" ]; then
  echo "kadid10k: present ($(find kadid10k/images -name '*.png' | wc -l | tr -d ' ') png), skipping"
else
  echo "kadid10k: downloading ~3 GB (this takes a while)..."
  curl -fL --retry 3 --retry-delay 5 --max-time 7200 "$ARCHIVE_URL" -o kadid10k.zip
  echo "kadid10k: extracting..."
  unzip -oq kadid10k.zip
  rm -f kadid10k.zip
  echo "kadid10k: $(find kadid10k/images -name '*.png' | wc -l | tr -d ' ') png"
fi

echo
echo "Done. Run:"
echo "  BLAZEDIFF_MOS_DATASET=\"$DEST/kadid10k\" \\"
echo "    cargo run --release -p blazediff-ssim-benchmark --features dssim --bin blazediff-ssim-quality"
