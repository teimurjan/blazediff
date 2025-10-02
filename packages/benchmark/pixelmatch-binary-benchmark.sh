#!/bin/bash

# Binary benchmark script using hyperfine
# Runs blazediff on all image pairs from 4k and page folders

FIXTURES_DIR="./fixtures"
BIN="./node_modules/.bin/pixelmatch"
WARMUP=5
RUNS=25

echo "Running binary benchmarks with hyperfine..."
echo "================================================"

# Find all image pairs
for folder in "4k" "page"; do
  dir="$FIXTURES_DIR/$folder"

  # Find all 'a' images
  for img_a in "$dir"/*a.png; do
    if [ -f "$img_a" ]; then
      # Get corresponding 'b' image
      img_b="${img_a%a.png}b.png"

      if [ -f "$img_b" ]; then
        pair_name="$folder/$(basename ${img_a%a.png})"
        echo ""
        echo "Benchmarking: $pair_name"
        hyperfine \
          -i \
          --warmup $WARMUP \
          --runs $RUNS \
          "$BIN $img_a $img_b"
      fi
    fi
  done
done

echo ""
echo "================================================"
echo "Benchmarks complete!"