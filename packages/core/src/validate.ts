/**
 * Argument checks shared by `diff` in core, core-wasm and core-native, so all
 * three throw the same {@link BlazeDiffError} codes and messages.
 */
import { isValidImage } from "./engine";
import { BlazeDiffError, type BlazeDiffErrorCode } from "./errors";
import type { DiffOptions, Image, Rgb } from "./types";

export function assertImage(
	image: Image,
	name: string,
	code: BlazeDiffErrorCode,
): void {
	if (!isValidImage(image?.data))
		throw new BlazeDiffError(
			code,
			`${name}.data must be a Uint8Array, Uint8ClampedArray or Buffer.`,
		);
	const { width, height, data } = image;
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 0 ||
		height < 0
	)
		throw new BlazeDiffError(
			code,
			`${name} has an invalid size: ${width}x${height}.`,
		);
	if (data.length !== width * height * 4)
		throw new BlazeDiffError(
			code,
			`${name}.data is ${data.length} bytes, expected ${width * height * 4} for ${width}x${height}.`,
		);
}

/** Checks everything in `options` that does not depend on the image size. */
export function assertOptions(
	options: Pick<DiffOptions, "metric" | "mask" | "render">,
): void {
	const { metric, mask, render } = options;
	if (metric !== undefined && metric !== "yiq" && metric !== "oklab")
		throw new BlazeDiffError(
			"invalid-option",
			`Unknown metric: ${metric}. Expected "yiq" or "oklab".`,
		);
	const background = render?.background;
	if (
		background !== undefined &&
		background !== "faded" &&
		background !== "transparent"
	)
		throw new BlazeDiffError(
			"invalid-option",
			`Unknown render.background: ${background}. Expected "faded" or "transparent".`,
		);
	assertRgb(render?.diffColor, "diffColor");
	assertRgb(render?.diffColorAlt, "diffColorAlt");
	assertRgb(render?.aaColor, "aaColor");
	if (mask !== undefined && !isValidImage(mask))
		throw new BlazeDiffError(
			"invalid-mask",
			"mask must be a byte array of width * height bytes.",
		);
}

/** Checks `output` and the mask length against a `width` × `height` comparison. */
export function assertTargets(
	options: Pick<DiffOptions, "mask" | "output">,
	width: number,
	height: number,
): void {
	const { mask, output } = options;
	if (output) {
		assertImage(output, "output", "invalid-output");
		if (output.width !== width || output.height !== height)
			throw new BlazeDiffError(
				"invalid-output",
				`output is ${output.width}x${output.height}, expected ${width}x${height}.`,
			);
	}
	if (mask !== undefined && mask.length !== width * height)
		throw new BlazeDiffError(
			"invalid-mask",
			`mask must be a byte array of width * height = ${width * height} bytes.`,
		);
}

function assertRgb(color: Rgb | undefined, name: string): void {
	if (
		color !== undefined &&
		(color.length !== 3 ||
			color.some(
				(channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
			))
	)
		throw new BlazeDiffError(
			"invalid-option",
			`render.${name} must contain three integer RGB channels.`,
		);
}
