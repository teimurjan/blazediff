import init, { diffRgba as wasmDiffRgba } from "../wasm/blazediff.js";

// Generated bindings are updated in version bump PRs, so keep the source-side
// ABI explicit while this wrapper targets the next generated artifact.
type WasmDiffRgba = (
	rgbaA: Uint8Array,
	rgbaB: Uint8Array,
	width: number,
	height: number,
	threshold: number,
	includeAA: boolean,
	diffMask: boolean,
	diffColorAlt: Uint8Array | undefined,
	outDiff: Uint8Array | undefined,
	colorSpace: string | undefined,
	ignoreMask: Uint8Array | undefined,
	windowSize: number | undefined,
) => number;

export interface DiffOptions {
	/** Color difference threshold (0-1). Lower = stricter. Default: 0.1 */
	threshold?: number;
	/** Count anti-aliased pixels as differences. Default: false */
	includeAA?: boolean;
	/** Render output with transparent background instead of grayscale base. Default: false */
	diffMask?: boolean;
	/** Alternative RGB color for darkening differences. Default: diff color */
	diffColorAlt?: [number, number, number];
	/** Color difference metric: "yiq" (default) or "oklab", which matches pixelmatch 8 */
	colorSpace?: "yiq" | "oklab";
	/** One byte per pixel (width × height); non-zero pixels are skipped */
	ignoreMask?: Uint8Array;
	/** Return the largest diff count in any N×N window instead of the total */
	windowSize?: number;
}

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

function toWasmRgb(
	color: [number, number, number] | undefined,
): Uint8Array | undefined {
	if (!color) return undefined;
	if (
		color.length !== 3 ||
		color.some(
			(channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
		)
	) {
		throw new RangeError(
			"diffColorAlt must contain three integer RGB channels",
		);
	}
	return Uint8Array.from(color);
}

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

/**
 * Compare two RGBA pixel buffers and return the number of differing pixels.
 *
 * Both buffers must be `width * height * 4` bytes in RGBA8 order. Decode
 * PNG/JPEG with `createImageBitmap` + `OffscreenCanvas.getImageData()` (or
 * the `ImageDecoder` API) and pass the resulting `Uint8Array` here.
 *
 * If `output` is provided it must be `width * height * 4` bytes long and the
 * diff visualization is written into it in place. With `windowSize` the result
 * is the largest N×N window count instead of the total.
 */
export function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options?: DiffOptions,
): Promise<number>;
export async function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options: DiffOptions = {},
): Promise<number> {
	await initBlazediff();
	return (wasmDiffRgba as unknown as WasmDiffRgba)(
		a,
		b,
		width,
		height,
		options.threshold ?? 0.1,
		options.includeAA ?? false,
		options.diffMask ?? false,
		toWasmRgb(options.diffColorAlt),
		output,
		options.colorSpace,
		options.ignoreMask,
		windowSide(options.windowSize),
	);
}

/** Floors a finite window size to >= 1 like @blazediff/core; Infinity turns windowing off. */
function windowSide(windowSize: number | undefined): number | undefined {
	if (windowSize === undefined || !Number.isFinite(windowSize))
		return undefined;
	return Math.max(1, Math.floor(windowSize));
}
