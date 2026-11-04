import type { Image, Size } from "./types";

/** Throws for a buffer that does not hold `width * height` RGBA pixels. */
export function assertImage(image: Image, name: string): void {
	const { data, width, height } = image ?? {};
	if (!ArrayBuffer.isView(data) || (data as Uint8Array).BYTES_PER_ELEMENT !== 1)
		throw new TypeError(
			`${name}.data must be a Uint8Array, Uint8ClampedArray or Buffer.`,
		);
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 1 ||
		height < 1
	)
		throw new RangeError(`${name} has an invalid size: ${width}x${height}.`);
	if (data.length !== width * height * 4)
		throw new RangeError(
			`${name}.data is ${data.length} bytes, expected ${width * height * 4} for ${width}x${height}.`,
		);
}

/**
 * Validates both inputs and the output, returning the mismatch result when
 * `a` and `b` differ in size.
 */
export function checkPair(
	a: Image,
	b: Image,
	output: Image | undefined,
): { kind: "dimension-mismatch"; a: Size; b: Size } | null {
	assertImage(a, "a");
	assertImage(b, "b");
	if (a.width !== b.width || a.height !== b.height)
		return {
			kind: "dimension-mismatch",
			a: { width: a.width, height: a.height },
			b: { width: b.width, height: b.height },
		};
	if (output) {
		assertImage(output, "output");
		if (output.width !== a.width || output.height !== a.height)
			throw new RangeError(
				`output is ${output.width}x${output.height}, expected ${a.width}x${a.height}.`,
			);
	}
	return null;
}
