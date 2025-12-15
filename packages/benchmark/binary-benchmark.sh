#!/bin/bash

# Binary benchmark script using hyperfine
# Compares blazediff, odiff, and pixelmatch across all image pairs

FIXTURES_DIR="./fixtures"

# Use env vars for binaries, with sensible defaults for local development
BLAZEDIFF_BIN="${BLAZEDIFF_BIN:-./node_modules/@blazediff/bin/binaries/blazediff-macos-arm64}"
ODIFF_BIN="${ODIFF_BIN:-./node_modules/odiff-bin/raw_binaries/odiff-macos-arm64}"

WARMUP=5
RUNS=25

echo "Running binary benchmarks with hyperfine..."
echo "================================================"
echo "BLAZEDIFF_BIN: $BLAZEDIFF_BIN"
echo "ODIFF_BIN: $ODIFF_BIN"
echo ""

# Verify binaries exist
echo "Verifying binaries..."
$BLAZEDIFF_BIN --version 2>/dev/null || echo "blazediff --version failed"
$ODIFF_BIN --version 2>/dev/null || echo "odiff --version failed"
echo ""

# Create output directory
mkdir -p ./output

# Build arrays of commands for each tool
blazediff_cmds=()
odiff_cmds=()
pixelmatch_cmds=()
names=()

for folder in "pixelmatch" "same" "4k" "page" "blazediff"; do
  dir="$FIXTURES_DIR/$folder"
  for img_a in "$dir"/*a.png; do
    if [ -f "$img_a" ]; then
      img_b="${img_a%a.png}b.png"
      if [ -f "$img_b" ]; then
        pair_name="$folder/$(basename ${img_a%a.png})"
        output_path="./output/$folder-$(basename ${img_a%a.png}).png"
        names+=("$pair_name")
        blazediff_cmds+=("$BLAZEDIFF_BIN $img_a $img_b $output_path --antialiasing")
        odiff_cmds+=("$ODIFF_BIN $img_a $img_b $output_path --antialiasing")
      fi
    fi
  done
done

echo "Found ${#names[@]} image pairs"
echo ""

# Build hyperfine command with all benchmarks
hyperfine_args=(-i --warmup $WARMUP --runs $RUNS)

for i in "${!names[@]}"; do
  hyperfine_args+=(-n "blazediff (${names[$i]})" "${blazediff_cmds[$i]}")
  hyperfine_args+=(-n "odiff (${names[$i]})" "${odiff_cmds[$i]}")
done

hyperfine_args+=(--export-markdown output/benchmark-results.md)

hyperfine "${hyperfine_args[@]}"

echo ""
echo "================================================"
echo "Benchmarks complete! Results saved to output/benchmark-results.md"
