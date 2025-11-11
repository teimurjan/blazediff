#!/bin/bash
# Prepare Img-Diff fixtures for SSIM testing
# This script converts a subset of Img-Diff images from JPG to PNG and renames them
# for easy use in the comparison test

set -e

IMGDIFF_DIR="Img-Diff/inpaint"
FIXTURES_DIR="fixtures/imgdiff"
NUM_SAMPLES="${1:-20}"

if [ ! -d "$IMGDIFF_DIR" ]; then
    echo "Error: $IMGDIFF_DIR not found"
    echo "Please extract the dataset first:"
    echo "  cd Img-Diff && unzip -q object_removal.zip"
    exit 1
fi

echo "Preparing Img-Diff fixtures..."
echo "Converting ${NUM_SAMPLES} image pairs from ${IMGDIFF_DIR}/ to ${FIXTURES_DIR}/"

# Create fixtures directory
mkdir -p "$FIXTURES_DIR"

# Find all image pairs (files ending with _0.jpg and _1.jpg)
pairs_found=0
converted=0

# Get list of base names (without _0/_1 suffix)
for img0 in "$IMGDIFF_DIR"/*_0.jpg; do
    [ -f "$img0" ] || continue

    base=$(basename "$img0" _0.jpg)
    img1="${IMGDIFF_DIR}/${base}_1.jpg"

    [ -f "$img1" ] || continue

    if [ $converted -ge $NUM_SAMPLES ]; then
        break
    fi

    # Convert to PNG with consistent naming
    out_a="${FIXTURES_DIR}/imgdiff_$(printf '%03d' $converted)_a.png"
    out_b="${FIXTURES_DIR}/imgdiff_$(printf '%03d' $converted)_b.png"

    # Use ImageMagick convert or ffmpeg to convert JPG to PNG
    if command -v convert >/dev/null 2>&1; then
        convert "$img0" "$out_a" 2>/dev/null
        convert "$img1" "$out_b" 2>/dev/null
    elif command -v magick >/dev/null 2>&1; then
        magick "$img0" "$out_a" 2>/dev/null
        magick "$img1" "$out_b" 2>/dev/null
    elif command -v ffmpeg >/dev/null 2>&1; then
        ffmpeg -i "$img0" "$out_a" -loglevel quiet -y
        ffmpeg -i "$img1" "$out_b" -loglevel quiet -y
    else
        echo "Error: No image conversion tool found (ImageMagick or ffmpeg required)"
        exit 1
    fi

    converted=$((converted + 1))
    echo "✓ Converted pair $converted/$NUM_SAMPLES: $base"
done

echo ""
echo "✓ Successfully prepared $converted image pairs in $FIXTURES_DIR/"
echo "Run tests with: pnpm --filter @blazediff/ssim test imgdiff-comparison"
