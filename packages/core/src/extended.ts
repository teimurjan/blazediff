/**
 * Diff loops for the non-default options: the OKLab metric, `ignoreMask` and
 * `windowSize`. The default YIQ loops in index.ts stay free of these checks.
 * The metric and AA check are passed as functions so each call site stays
 * monomorphic: branching between both kernels in one loop measurably slows
 * V8's code (inlining budget, unfolded constants).
 */
import { antialiased } from "./antialiasing";
import { oklabDelta, oklabDeltaOverWhite, stepLimits } from "./oklab";
import {
	LITTLE_ENDIAN,
	type PixelData,
	SHIFT_A,
	SHIFT_B,
	SHIFT_G,
	SHIFT_R,
	YIQ_COEFF_I,
	YIQ_COEFF_Q,
	YIQ_COEFF_Y,
	YIQ_I_B,
	YIQ_I_G,
	YIQ_I_R,
	YIQ_LAMBDA_MAX,
	YIQ_Q_B,
	YIQ_Q_G,
	YIQ_Q_R,
	YIQ_Y_B,
	YIQ_Y_G,
	YIQ_Y_R,
} from "./pixel";
import type { Rgb, WindowHit } from "./types";
import { findMaxWindow } from "./window";

/**
 * YIQ verdict for two different pixel words, matching the default loops:
 * 0 within `maxDelta`, else -1 when img2 is darker and 1 when not.
 */
function yiqDelta(
	av: number,
	bv: number,
	index: number,
	maxDelta: number,
	_limits: Int32Array,
	reject: number,
): number {
	let dr: number;
	let dg: number;
	let db: number;
	if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
		dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
		dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
		db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
		if (dr * dr + dg * dg + db * db <= reject) return 0;
	} else {
		const pos = index * 4;
		const r1 = (av >>> SHIFT_R) & 0xff;
		const g1 = (av >>> SHIFT_G) & 0xff;
		const b1 = (av >>> SHIFT_B) & 0xff;
		const a1 = (av >>> SHIFT_A) & 0xff;
		const r2 = (bv >>> SHIFT_R) & 0xff;
		const g2 = (bv >>> SHIFT_G) & 0xff;
		const b2 = (bv >>> SHIFT_B) & 0xff;
		const a2 = (bv >>> SHIFT_A) & 0xff;
		const da = a1 - a2;
		// pos is a multiple of 4, so the red background is always 48.
		const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}
	const yc = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
	const ic = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
	const qc = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
	const dist =
		YIQ_COEFF_Y * yc * yc + YIQ_COEFF_I * ic * ic + YIQ_COEFF_Q * qc * qc;
	if (dist <= maxDelta) return 0;
	return yc > 0 ? -1 : 1;
}

/** Metric verdict for two different pixel words: 0 within threshold, else ±1. */
type DeltaFn = (
	av: number,
	bv: number,
	index: number,
	maxDelta: number,
	limits: Int32Array,
	reject: number,
) => number;

/** True when under a quarter of ~4096 evenly spaced pixels differ. */
function isSparseDiff(a32: Uint32Array, b32: Uint32Array): boolean {
	const step = Math.max(1, Math.floor(a32.length / 4096));
	let samples = 0;
	let differing = 0;
	for (let i = 0; i < a32.length; i += step) {
		samples++;
		if (a32[i] !== b32[i]) differing++;
	}
	return differing * 4 < samples;
}

/** First index in [i, end) where the images differ, or `end`. Skips equal runs 4 pixels at a time. */
function nextDiff(
	a32: Uint32Array,
	b32: Uint32Array,
	i: number,
	end: number,
): number {
	while (
		i + 4 <= end &&
		((a32[i] ^ b32[i]) |
			(a32[i + 1] ^ b32[i + 1]) |
			(a32[i + 2] ^ b32[i + 2]) |
			(a32[i + 3] ^ b32[i + 3])) ===
			0
	)
		i += 4;
	while (i < end && a32[i] === b32[i]) i++;
	return i;
}

function pickDelta(oklab: boolean, checkerboard: boolean): DeltaFn {
	if (!oklab) return yiqDelta;
	return checkerboard ? oklabDelta : oklabDeltaOverWhite;
}

type ExcludedAAFn = (
	image1: PixelData,
	image2: PixelData,
	x: number,
	y: number,
	width: number,
	height: number,
	a32: Uint32Array,
	b32: Uint32Array,
) => boolean;

// One wrapper per background keeps antialiased's `overWhite` a constant at each call site.
function isExcludedAAOverWhite(
	image1: PixelData,
	image2: PixelData,
	x: number,
	y: number,
	width: number,
	height: number,
	a32: Uint32Array,
	b32: Uint32Array,
): boolean {
	return (
		antialiased(image1, x, y, width, height, a32, b32, true) ||
		antialiased(image2, x, y, width, height, b32, a32, true)
	);
}

function isExcludedAACheckerboard(
	image1: PixelData,
	image2: PixelData,
	x: number,
	y: number,
	width: number,
	height: number,
	a32: Uint32Array,
	b32: Uint32Array,
): boolean {
	return (
		antialiased(image1, x, y, width, height, a32, b32) ||
		antialiased(image2, x, y, width, height, b32, a32)
	);
}

// Packs an 8-bit gray value into an opaque RGBA word.
const GRAY_MUL = LITTLE_ENDIAN ? 0x010101 : 0x01010100;
const OPAQUE = LITTLE_ENDIAN ? 0xff000000 : 0xff;

/** Gray background word for `word`; same float expression as drawGrayPixel. */
function grayWord(word: number, alpha: number): number {
	const luma =
		((word >>> SHIFT_R) & 0xff) * YIQ_Y_R +
		((word >>> SHIFT_G) & 0xff) * YIQ_Y_G +
		((word >>> SHIFT_B) & 0xff) * YIQ_Y_B;
	const value =
		(255 + ((luma - 255) * alpha * ((word >>> SHIFT_A) & 0xff)) / 255) | 0;
	return (value * GRAY_MUL) | OPAQUE;
}

/** Fills [start, end) with gray, reusing the previous word's result across runs. */
function fillGray(
	a32: Uint32Array,
	out32: Uint32Array,
	start: number,
	end: number,
	alpha: number,
): void {
	let prev = a32[start];
	let gray = grayWord(prev, alpha);
	for (let i = start; i < end; i++) {
		const word = a32[i];
		if (word !== prev) {
			prev = word;
			gray = grayWord(word, alpha);
		}
		out32[i] = gray;
	}
}

function packRgb(r: number, g: number, b: number): number {
	return LITTLE_ENDIAN
		? (r | (g << 8) | (b << 16) | 0xff000000) >>> 0
		: ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

/** Count-only diff: one pass, no output buffer. */
export function diffExtendedCountOnly(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	height: number,
	oklab: boolean,
	checkerboard: boolean,
	maxDelta: number,
	excludeAA: boolean,
	ignoreMask: PixelData | undefined,
	window: number,
	hit: WindowHit | null,
): number {
	const delta = pickDelta(oklab, checkerboard);
	const isExcludedAA: ExcludedAAFn = oklab
		? isExcludedAAOverWhite
		: isExcludedAACheckerboard;
	const limits = stepLimits(maxDelta);
	const reject = maxDelta / YIQ_LAMBDA_MAX;
	const sparse = isSparseDiff(a32, b32);
	const diffMap =
		window > 0 && hit !== null ? new Uint8Array(width * height) : null;
	let minY = height;
	let maxY = -1;
	let diff = 0;

	for (let y = 0; y < height; y++) {
		const rowStart = y * width;
		const rowEnd = rowStart + width;
		for (let i = rowStart; i < rowEnd; i++) {
			if (a32[i] === b32[i]) {
				if (sparse) i = nextDiff(a32, b32, i + 1, rowEnd) - 1;
				continue;
			}
			if (ignoreMask !== undefined && ignoreMask[i] !== 0) continue;
			if (delta(a32[i], b32[i], i, maxDelta, limits, reject) === 0) continue;
			if (
				excludeAA &&
				isExcludedAA(image1, image2, i - rowStart, y, width, height, a32, b32)
			)
				continue;
			diff++;
			if (diffMap !== null) {
				diffMap[i] = 1;
				if (y < minY) minY = y;
				maxY = y;
			}
		}
	}

	if (diffMap !== null && hit !== null && diff > 0)
		findMaxWindow(diffMap, width, height, window, minY, maxY, hit);
	return diff;
}

/**
 * Diff with an output buffer. Pass 1 finds blocks with at least one
 * above-threshold pixel and fills the rest gray; pass 2 walks only those.
 * A misaligned output is diffed into an aligned copy and copied back.
 */
export function diffExtendedWithOutput(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	output: PixelData,
	width: number,
	height: number,
	oklab: boolean,
	checkerboard: boolean,
	maxDelta: number,
	blockSize: number,
	alpha: number,
	aaColor: Rgb,
	diffColor: Rgb,
	diffColorAlt: Rgb,
	excludeAA: boolean,
	diffMask: boolean,
	ignoreMask: PixelData | undefined,
	window: number,
	hit: WindowHit | null,
): number {
	const len = width * height;
	if ((output.byteOffset & 3) !== 0) {
		const aligned = new Uint8Array(output);
		const diff = diffExtendedWithOutput(
			image1,
			image2,
			a32,
			b32,
			aligned,
			width,
			height,
			oklab,
			checkerboard,
			maxDelta,
			blockSize,
			alpha,
			aaColor,
			diffColor,
			diffColorAlt,
			excludeAA,
			diffMask,
			ignoreMask,
			window,
			hit,
		);
		output.set(aligned);
		return diff;
	}

	const out32 = new Uint32Array(output.buffer, output.byteOffset, len);
	const delta = pickDelta(oklab, checkerboard);
	const isExcludedAA: ExcludedAAFn = oklab
		? isExcludedAAOverWhite
		: isExcludedAACheckerboard;
	const limits = stepLimits(maxDelta);
	const reject = maxDelta / YIQ_LAMBDA_MAX;
	const sparse = isSparseDiff(a32, b32);
	const aaPacked = packRgb(aaColor[0], aaColor[1], aaColor[2]);
	const diffPacked = packRgb(diffColor[0], diffColor[1], diffColor[2]);
	const altPacked = packRgb(diffColorAlt[0], diffColorAlt[1], diffColorAlt[2]);
	const blocksX = Math.ceil(width / blockSize);
	const blocksY = Math.ceil(height / blockSize);
	const changedBlocks = new Uint32Array(blocksX * blocksY);
	let changedBlocksCount = 0;

	for (let by = 0; by < blocksY; by++) {
		const startY = by * blockSize;
		const endY = Math.min(startY + blockSize, height);
		for (let bx = 0; bx < blocksX; bx++) {
			const startX = bx * blockSize;
			const endX = Math.min(startX + blockSize, width);

			const changed = blockHasDiff(
				a32,
				b32,
				width,
				startX,
				startY,
				endX,
				endY,
				delta,
				maxDelta,
				limits,
				reject,
				sparse,
				ignoreMask,
			);

			if (changed) {
				changedBlocks[changedBlocksCount++] = by * blocksX + bx;
			} else if (!diffMask) {
				for (let y = startY; y < endY; y++) {
					fillGray(a32, out32, y * width + startX, y * width + endX, alpha);
				}
			}
		}
	}

	if (changedBlocksCount === 0) return 0;

	const diffMap = window > 0 && hit !== null ? new Uint8Array(len) : null;
	let minY = height;
	let maxY = -1;
	let diff = 0;

	for (let blockIdx = 0; blockIdx < changedBlocksCount; blockIdx++) {
		const block = changedBlocks[blockIdx];
		const bx = block % blocksX;
		const by = (block / blocksX) | 0;
		const startX = bx * blockSize;
		const startY = by * blockSize;
		const endX = Math.min(startX + blockSize, width);
		const endY = Math.min(startY + blockSize, height);

		const blockDiff = diffBlock(
			image1,
			image2,
			a32,
			b32,
			out32,
			width,
			height,
			startX,
			startY,
			endX,
			endY,
			delta,
			isExcludedAA,
			maxDelta,
			limits,
			reject,
			alpha,
			aaPacked,
			diffPacked,
			altPacked,
			excludeAA,
			diffMask,
			ignoreMask,
			diffMap,
		);
		if (blockDiff > 0) {
			diff += blockDiff;
			if (startY < minY) minY = startY;
			if (endY - 1 > maxY) maxY = endY - 1;
		}
	}

	if (diffMap !== null && hit !== null && diff > 0)
		findMaxWindow(diffMap, width, height, window, minY, maxY, hit);
	return diff;
}

/** Pass 1: whether a block holds at least one above-threshold, unmasked pixel. */
function blockHasDiff(
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
	delta: DeltaFn,
	maxDelta: number,
	limits: Int32Array,
	reject: number,
	sparse: boolean,
	ignoreMask: PixelData | undefined,
): boolean {
	for (let y = startY; y < endY; y++) {
		const rowEnd = y * width + endX;
		for (let i = y * width + startX; i < rowEnd; i++) {
			if (a32[i] === b32[i]) {
				if (sparse) i = nextDiff(a32, b32, i + 1, rowEnd) - 1;
				continue;
			}
			if (ignoreMask !== undefined && ignoreMask[i] !== 0) continue;
			if (delta(a32[i], b32[i], i, maxDelta, limits, reject) !== 0) return true;
		}
	}
	return false;
}

/**
 * Pass 2: draws one changed block and returns its counted diff pixels.
 * Counted pixels are marked in `diffMap` when windowing.
 */
function diffBlock(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	out32: Uint32Array,
	width: number,
	height: number,
	startX: number,
	startY: number,
	endX: number,
	endY: number,
	delta: DeltaFn,
	isExcludedAA: ExcludedAAFn,
	maxDelta: number,
	limits: Int32Array,
	reject: number,
	alpha: number,
	aaPacked: number,
	diffPacked: number,
	altPacked: number,
	excludeAA: boolean,
	diffMask: boolean,
	ignoreMask: PixelData | undefined,
	diffMap: Uint8Array | null,
): number {
	let diff = 0;
	let prevWord = a32[startY * width + startX];
	let prevGray = grayWord(prevWord, alpha);

	for (let y = startY; y < endY; y++) {
		const yOffset = y * width;
		for (let x = startX; x < endX; x++) {
			const i = yOffset + x;
			const av = a32[i];
			const bv = b32[i];
			const verdict =
				av === bv || (ignoreMask !== undefined && ignoreMask[i] !== 0)
					? 0
					: delta(av, bv, i, maxDelta, limits, reject);

			if (verdict === 0) {
				if (!diffMask) {
					if (av !== prevWord) {
						prevWord = av;
						prevGray = grayWord(av, alpha);
					}
					out32[i] = prevGray;
				}
			} else if (
				excludeAA &&
				isExcludedAA(image1, image2, x, y, width, height, a32, b32)
			) {
				if (!diffMask) out32[i] = aaPacked;
			} else {
				out32[i] = verdict < 0 ? altPacked : diffPacked;
				diff++;
				if (diffMap !== null) diffMap[i] = 1;
			}
		}
	}

	return diff;
}
