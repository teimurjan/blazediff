import { diffPixels } from "./engine";
import type { DiffOptions, DiffResult, Image, Rgb, WindowHit } from "./types";
import { assertImage, assertOptions, assertTargets } from "./validate";
import { windowSide } from "./window";

const DEFAULT_DIFF_COLOR: Rgb = [255, 0, 0];
const DEFAULT_AA_COLOR: Rgb = [255, 255, 0];

/**
 * Compares two RGBA images pixel by pixel.
 *
 * Images of different sizes return `kind: "dimension-mismatch"`. Invalid
 * buffers or options throw a {@link BlazeDiffError}.
 *
 * @example
 * ```ts
 * const result = diff(a, b, { output: { data: out, width, height } });
 * if (result.kind === "compared" && !result.identical) console.log(result.count);
 * ```
 */
export function diff(
	a: Image,
	b: Image,
	options: DiffOptions = {},
): DiffResult {
	assertImage(a, "a", "invalid-image");
	assertImage(b, "b", "invalid-image");
	if (a.width !== b.width || a.height !== b.height) {
		return {
			kind: "dimension-mismatch",
			a: { width: a.width, height: a.height },
			b: { width: b.width, height: b.height },
		};
	}

	const {
		threshold = 0.1,
		antialiasing = true,
		metric = "yiq",
		mask,
		window,
		output,
		render = {},
	} = options;
	const {
		alpha = 0.1,
		diffColor = DEFAULT_DIFF_COLOR,
		diffColorAlt = diffColor,
		aaColor = DEFAULT_AA_COLOR,
		background = "faded",
	} = render;
	const { width, height } = a;
	const pixels = width * height;

	assertOptions(options);
	assertTargets(options, width, height);

	// "transparent" means a clear background, whatever the buffer held before.
	if (output && background === "transparent") output.data.fill(0);

	const side = windowSide(window, width, height);
	const hit: WindowHit = { x: 0, y: 0, count: 0 };
	const count = diffPixels(
		a.data,
		b.data,
		output?.data,
		width,
		height,
		{
			threshold,
			alpha,
			aaColor,
			diffColor,
			diffColorAlt,
			excludeAA: antialiasing,
			diffMask: background === "transparent",
			oklab: metric === "oklab",
			checkerboard: true,
			mask,
			window: side,
		},
		hit,
	);

	return {
		kind: "compared",
		count,
		percentage: pixels > 0 ? (100 * count) / pixels : 0,
		identical: count === 0,
		...(side > 0 && { window: hit }),
	};
}
