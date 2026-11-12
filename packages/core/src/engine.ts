import { antialiased } from "./antialiasing";
import { diffExtendedCountOnly, diffExtendedWithOutput } from "./extended";
import {
	LITTLE_ENDIAN,
	type PixelData,
	YIQ_COEFF_I,
	YIQ_COEFF_Q,
	YIQ_COEFF_Y,
	YIQ_I_B,
	YIQ_I_G,
	YIQ_I_R,
	YIQ_Q_B,
	YIQ_Q_G,
	YIQ_Q_R,
	YIQ_Y_B,
	YIQ_Y_G,
	YIQ_Y_R,
} from "./pixel";
import { countDiff, drawDiff, drawGray, type SameRange } from "./scan";
import type { Rgb, WindowHit } from "./types";

/** Resolved options for {@link diffPixels}; every entry point validates first. */
export interface EngineOptions {
	threshold: number;
	alpha: number;
	aaColor: Rgb;
	diffColor: Rgb;
	diffColorAlt: Rgb;
	excludeAA: boolean;
	diffMask: boolean;
	/** Zero the output before drawing, whatever it held. */
	clear: boolean;
	oklab: boolean;
	/** Blend semi-transparent OKLab pixels over pixelmatch 8's checkerboard, or white when false. */
	checkerboard: boolean;
	mask: PixelData | undefined;
	/** Window side from {@link windowSide}, 0 when off. */
	window: number;
}

/**
 * Counts the differing pixels of two equally sized RGBA buffers and, with
 * `output`, draws the diff. With a window, `hit` receives the busiest one.
 * Inputs are trusted: `diff` and the pixelmatch adapter validate them.
 */
export function diffPixels(
	image1: PixelData,
	image2: PixelData,
	output: PixelData | undefined,
	width: number,
	height: number,
	options: EngineOptions,
	hit: WindowHit | null,
): number {
	const {
		threshold,
		alpha,
		aaColor,
		diffColor,
		diffColorAlt,
		excludeAA,
		diffMask,
		clear,
		oklab,
		checkerboard,
		mask,
		window,
	} = options;
	const len = width * height;

	// The draw loops overwrite pixels they still read, so an output that
	// shares memory with an input is drawn into a copy first.
	if (output && (overlaps(output, image1) || overlaps(output, image2))) {
		const scratch = new Uint8Array(output);
		const count = diffPixels(
			image1,
			image2,
			scratch,
			width,
			height,
			options,
			hit,
		);
		output.set(scratch);
		return count;
	}
	if (output && clear) output.fill(0);

	if (
		HAS_NATIVE_COMPARE &&
		image1 instanceof Uint8Array &&
		image2 instanceof Uint8Array &&
		Buffer.compare(image1, image2) === 0
	) {
		if (output && !diffMask) fillGray(image1, output, len, alpha);
		return 0;
	}

	const a32 = new Uint32Array(image1.buffer, image1.byteOffset, len);
	const b32 = new Uint32Array(image2.buffer, image2.byteOffset, len);

	// Maximum acceptable square distance between two colors;
	// 35215 is the maximum possible value for the YIQ difference metric
	const maxDelta = 35215 * threshold * threshold;

	// OKLab, a mask or a window take the extended loops, which leave the
	// default YIQ loops below untouched.
	if (oklab || mask || window > 0) {
		const metricDelta = oklab ? threshold : maxDelta;
		const scan = window > 0 ? hit : null;
		if (output == null) {
			return diffExtendedCountOnly(
				image1,
				image2,
				a32,
				b32,
				width,
				height,
				oklab,
				checkerboard,
				metricDelta,
				excludeAA,
				mask,
				window,
				scan,
			);
		}
		return diffExtendedWithOutput(
			image1,
			image2,
			a32,
			b32,
			output,
			width,
			height,
			oklab,
			checkerboard,
			metricDelta,
			calculateOptimalBlockSize(width, height),
			alpha,
			aaColor,
			diffColor,
			diffColorAlt,
			excludeAA,
			diffMask,
			mask,
			window,
			scan,
		);
	}

	// The word loops need a little-endian platform and a 4-byte aligned output.
	if (!LITTLE_ENDIAN || (output && (output.byteOffset & 3) !== 0)) {
		return diffBytes(
			image1,
			image2,
			a32,
			b32,
			output,
			width,
			height,
			maxDelta,
			alpha,
			aaColor,
			diffColor,
			diffColorAlt,
			excludeAA,
			diffMask,
		);
	}

	const sameRange = nativeSameRange(image1, image2);
	if (output == null) {
		return countDiff(
			image1,
			image2,
			a32,
			b32,
			width,
			height,
			maxDelta,
			excludeAA,
			sameRange,
		);
	}

	return drawDiff(
		image1,
		image2,
		a32,
		b32,
		new Uint32Array(output.buffer, output.byteOffset, len),
		width,
		height,
		maxDelta,
		alpha,
		aaColor,
		diffColor,
		diffColorAlt,
		excludeAA,
		diffMask,
		sameRange,
	);
}

/**
 * Node's `Buffer` compares bytes several times faster than a JS loop. A
 * browser polyfill of it compares byte by byte, so it does not count.
 */
const HAS_NATIVE_COMPARE =
	typeof Buffer !== "undefined" &&
	typeof process !== "undefined" &&
	!!process.versions?.node;

/** Byte equality of a pixel range through the native compare, or null without one. */
function nativeSameRange(image1: PixelData, image2: PixelData): SameRange {
	if (!HAS_NATIVE_COMPARE) return null;
	const a = Buffer.from(image1.buffer, image1.byteOffset, image1.byteLength);
	const b = Buffer.from(image2.buffer, image2.byteOffset, image2.byteLength);
	return (from, to) => a.compare(b, from * 4, to * 4, from * 4, to * 4) === 0;
}

function overlaps(a: PixelData, b: PixelData): boolean {
	return (
		a.buffer === b.buffer &&
		a.byteOffset < b.byteOffset + b.byteLength &&
		b.byteOffset < a.byteOffset + a.byteLength
	);
}

/** Gray copy of `image`, the output of two identical images. */
function fillGray(
	image: PixelData,
	output: PixelData,
	len: number,
	alpha: number,
): void {
	if (LITTLE_ENDIAN && ((output.byteOffset | image.byteOffset) & 3) === 0) {
		drawGray(
			new Uint32Array(image.buffer, image.byteOffset, len),
			new Uint32Array(output.buffer, output.byteOffset, len),
			alpha,
		);
		return;
	}
	for (let i = 0; i < len; i++) {
		drawGrayPixel(image, i * 4, alpha, output);
	}
}

/** The diff one byte at a time, for a misaligned output or a big-endian platform. */
function diffBytes(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	output: PixelData | undefined,
	width: number,
	height: number,
	maxDelta: number,
	alpha: number,
	[aaR, aaG, aaB]: Rgb,
	[diffR, diffG, diffB]: Rgb,
	[altR, altG, altB]: Rgb,
	excludeAA: boolean,
	diffMask: boolean,
): number {
	let diff = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			const pos = i * 4;
			const delta =
				a32[i] === b32[i] ? 0 : colorDelta(image1, image2, pos, pos);
			if (!(Math.abs(delta) > maxDelta)) {
				if (output && !diffMask) drawGrayPixel(image1, pos, alpha, output);
				continue;
			}
			if (
				excludeAA &&
				(antialiased(image1, x, y, width, height, a32, b32) ||
					antialiased(image2, x, y, width, height, b32, a32))
			) {
				if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
				continue;
			}
			if (output) {
				if (delta < 0) drawPixel(output, pos, altR, altG, altB);
				else drawPixel(output, pos, diffR, diffG, diffB);
			}
			diff++;
		}
	}
	return diff;
}

/** Check if array is valid pixel data */
export function isValidImage(arr: unknown): arr is PixelData {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}

const LOG2_E = Math.LOG2E;

export function calculateOptimalBlockSize(
	width: number,
	height: number,
): number {
	const area = width * height;

	const scale = Math.sqrt(area) / 100;
	const rawSize = 16 * Math.sqrt(scale);

	// More efficient power-of-2 rounding using bit operations
	const log2Val = Math.log(rawSize) * LOG2_E;
	return 1 << Math.round(log2Val); // Bit shift instead of Math.pow(2, x)
}
/**
 * Calculate color difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function colorDelta(
	image1: PixelData,
	image2: PixelData,
	k: number,
	m: number,
): number {
	const r1 = image1[k];
	const g1 = image1[k + 1];
	const b1 = image1[k + 2];
	const a1 = image1[k + 3];
	const r2 = image2[m];
	const g2 = image2[m + 1];
	const b2 = image2[m + 2];
	const a2 = image2[m + 3];

	let dr = r1 - r2;
	let dg = g1 - g2;
	let db = b1 - b2;
	const da = a1 - a2;

	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// blend pixels with background
		const rb = 48 + 159 * (k & 1);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	const y = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
	const i = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
	const q = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
	const delta = YIQ_COEFF_Y * y * y + YIQ_COEFF_I * i * i + YIQ_COEFF_Q * q * q;

	// encode whether the pixel lightens or darkens in the sign
	return y > 0 ? -delta : delta;
}

/**
 * Draw a grayscale pixel to the output buffer
 */
export function drawGrayPixel(
	image: PixelData,
	index: number,
	alpha: number,
	output: PixelData,
): void {
	const luma =
		image[index] * YIQ_Y_R +
		image[index + 1] * YIQ_Y_G +
		image[index + 2] * YIQ_Y_B;
	const value = 255 + ((luma - 255) * alpha * image[index + 3]) / 255;
	drawPixel(output, index, value, value, value);
}

/**
 * Draw a colored pixel to the output buffer
 */
export function drawPixel(
	output: PixelData,
	position: number,
	r: number,
	g: number,
	b: number,
): void {
	output[position + 0] = r;
	output[position + 1] = g;
	output[position + 2] = b;
	output[position + 3] = 255;
}
