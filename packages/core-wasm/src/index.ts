import {
	assertImage,
	assertOptions,
	assertTargets,
	type DiffOptions,
	type DiffResult,
	type Image,
	type Rgb,
	windowSide,
} from "@blazediff/core";
import init, { diffRgba } from "../wasm/blazediff.js";

export type { DiffOptions, DiffResult, Image } from "@blazediff/core";
export { BlazeDiffError } from "@blazediff/core";

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

/**
 * Initialize the wasm module. Safe to call multiple times - subsequent calls
 * return the same promise. By default fetches the bundled `blazediff_bg.wasm`
 * via the module's import path. Pass a custom `URL`, `Response`, or bytes to
 * load the wasm from a different location (CDN, custom asset pipeline, etc.).
 */
export function initBlazediff(input?: WasmInput): Promise<void> {
	if (!initPromise) {
		const arg =
			input === undefined ? undefined : ({ module_or_path: input } as never);
		initPromise = init(arg).then(() => undefined);
	}
	return initPromise as Promise<void>;
}

function toWasmRgb(color: Rgb | undefined): Uint8Array | undefined {
	return color && Uint8Array.from(color);
}

/**
 * Compares two RGBA images with the same algorithm as `@blazediff/core-native`.
 *
 * Takes and returns the `@blazediff/core` types. Decode PNG or JPEG with
 * `createImageBitmap` + `OffscreenCanvas.getImageData()` (or `ImageDecoder`)
 * and pass the pixels here. With `output`, the diff is drawn into its buffer.
 */
export async function diff(
	a: Image,
	b: Image,
	options: DiffOptions = {},
): Promise<DiffResult> {
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
	const { width, height } = a;
	const pixels = width * height;

	assertOptions(options);
	assertTargets(options, width, height);
	const background = render.background ?? "faded";

	await initBlazediff();
	// Identical bytes count 0 under every option; skip copying them into wasm.
	if (!output && window === undefined && sameBytes(a.data, b.data)) {
		return { kind: "compared", count: 0, percentage: 0, identical: true };
	}
	const side = windowSide(window, width, height);
	const [count, hasWindow, x, y, windowCount] = diffRgba(
		asBytes(a.data),
		asBytes(b.data),
		width,
		height,
		threshold,
		antialiasing,
		metric,
		mask && asBytes(mask),
		side || undefined,
		render.alpha ?? 0.1,
		toWasmRgb(render.diffColor),
		toWasmRgb(render.diffColorAlt),
		toWasmRgb(render.aaColor),
		background === "transparent",
		output && asBytes(output.data),
	);

	return {
		kind: "compared",
		count,
		percentage: pixels > 0 ? (100 * count) / pixels : 0,
		identical: count === 0,
		...(hasWindow === 1 && { window: { x, y, count: windowCount } }),
	};
}

type NodeBuffer = {
	compare(a: Uint8Array, b: Uint8Array): number;
};

/** Native memcmp through Node's `Buffer`; false where there is none. */
function sameBytes(
	a: Uint8Array | Uint8ClampedArray,
	b: Uint8Array | Uint8ClampedArray,
): boolean {
	const buffer = (globalThis as { Buffer?: NodeBuffer }).Buffer;
	return buffer !== undefined && buffer.compare(asBytes(a), asBytes(b)) === 0;
}

/** A Uint8Array view of the same memory, so wasm-bindgen writes back into it. */
function asBytes(data: Uint8Array | Uint8ClampedArray): Uint8Array {
	return data instanceof Uint8Array
		? data
		: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
