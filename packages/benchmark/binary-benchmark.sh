#!/bin/bash

# Binary benchmark script using hyperfine
# Single invocation comparing tools across all image pairs

FIXTURES_DIR="./fixtures"
BLAZEDIFF_CLI_BIN="./node_modules/.bin/blazediff-cli"
BLAZEDIFF_NATIVE_BIN="./node_modules/.bin/blazediff"
ODIFF_BIN="./node_modules/.bin/odiff"
PIXELMATCH_BIN="./node_modules/.bin/pixelmatch"
WARMUP=5
RUNS=25

echo "Running binary benchmarks with hyperfine..."
echo "================================================"

# Verify binaries exist and show versions
echo "Verifying binaries..."
echo "blazediff: $(which $BLAZEDIFF_NATIVE_BIN 2>/dev/null || echo 'not found')"
echo "odiff: $(which $ODIFF_BIN 2>/dev/null || echo 'not found')"
echo "pixelmatch: $(which $PIXELMATCH_BIN 2>/dev/null || echo 'not found')"

# Test each binary with a quick run
echo ""
echo "Testing binaries..."
$BLAZEDIFF_NATIVE_BIN --version 2>/dev/null || echo "blazediff --version failed"
$ODIFF_BIN --version 2>/dev/null || echo "odiff --version failed"
echo ""

# Create output directory
mkdir -p ./output

# Build arrays of commands for each tool
blazediff_cmds=()
blazediff_cli_cmds=()
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
        blazediff_cmds+=("$BLAZEDIFF_NATIVE_BIN $img_a $img_b $output_path --antialiasing")
        blazediff_cli_cmds+=("$BLAZEDIFF_CLI_BIN diff $img_a $img_b --output $output_path --transformer sharp")
        odiff_cmds+=("$ODIFF_BIN $img_a $img_b $output_path --antialiasing")
        pixelmatch_cmds+=("$PIXELMATCH_BIN $img_a $img_b $output_path")
      fi
    fi
  done
done

echo "Found ${#names[@]} image pairs"
echo ""

# Build hyperfine command with all benchmarks
# Each tool x each image pair = separate benchmark entry
# -N disables shell to avoid shell startup overhead affecting results
hyperfine_args=(-i -N --warmup $WARMUP --runs $RUNS)

for i in "${!names[@]}"; do
  hyperfine_args+=(-n "blazediff (${names[$i]})" "${blazediff_cmds[$i]}")
  hyperfine_args+=(-n "blazediff-cli (${names[$i]})" "${blazediff_cli_cmds[$i]}")
  hyperfine_args+=(-n "odiff (${names[$i]})" "${odiff_cmds[$i]}")
  hyperfine_args+=(-n "pixelmatch (${names[$i]})" "${pixelmatch_cmds[$i]}")
done

hyperfine_args+=(--export-markdown output/benchmark-results.md)

hyperfine "${hyperfine_args[@]}"

echo ""
echo "================================================"
echo "Benchmarks complete! Results saved to output/benchmark-results.md"
