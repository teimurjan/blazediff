import init, { diffRgba as wasmDiffRgba } from "../wasm/blazediff.js";

export interface DiffOptions {
	/** Color difference threshold (0-1). Lower = stricter. Default: 0.1 */
	threshold?: number;
	/** Count anti-aliased pixels as differences. Default: false */
	includeAA?: boolean;
	/** Render output with transparent background instead of grayscale base. Default: false */
	diffMask?: boolean;
}

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

/**
 * Initialize the wasm module. Safe to call multiple times — subsequent calls
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
 * diff visualization is written into it in place.
 */
export async function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options: DiffOptions = {},
): Promise<number> {
	await initBlazediff();
	return wasmDiffRgba(
		a,
		b,
		width,
		height,
		options.threshold ?? 0.1,
		options.includeAA ?? false,
		options.diffMask ?? false,
		output,
	);
}
