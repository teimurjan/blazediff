import init, { miloRgba as wasmMiloRgba } from "../wasm/blazediff_milo.js";

// Generated bindings are updated in version bump PRs, so keep the source-side
// ABI explicit while this wrapper targets the next generated artifact.
interface WasmMiloResult {
	readonly rawError: number;
	readonly mos: number;
	readonly width: number;
	readonly height: number;
	mask(): Float32Array;
	errorMap(): Float32Array;
	free(): void;
}
type WasmMiloRgba = (
	reference: Uint8Array,
	distorted: Uint8Array,
	width: number,
	height: number,
) => WasmMiloResult;

export interface MiloOptions {
	/**
	 * Include the visibility mask and per-pixel error map. Default: false. Each
	 * is one float per pixel, copied out of wasm memory.
	 */
	returnMaps?: boolean;
}

export interface MiloResult {
	/** Masked mean absolute error. Zero means identical. This is the metric. */
	rawError: number;
	/**
	 * `rawError` on KADID-10k's 1-5 mean-opinion-score scale, through the
	 * metric's learned calibration. About 4.35 for identical images, lower with
	 * visible damage. Threshold on `rawError`, not on this.
	 */
	mos: number;
	/** Row-major visibility mask in (0, 4). Present only when `returnMaps` is set. */
	mask?: Float32Array;
	/** Row-major perceived error in 0..1. Present only when `returnMaps` is set. */
	errorMap?: Float32Array;
	width: number;
	height: number;
}

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

/**
 * Initialize the wasm module. Safe to call multiple times - subsequent calls
 * return the same promise. By default fetches the bundled
 * `blazediff_milo_bg.wasm` via the module's import path. Pass a custom `URL`,
 * `Response`, or bytes to load the wasm from a different location (CDN,
 * custom asset pipeline, etc.).
 */
export function initMilo(input?: WasmInput): Promise<void> {
	if (!initPromise) {
		const arg =
			input === undefined ? undefined : ({ module_or_path: input } as never);
		initPromise = init(arg).then(() => undefined);
	}
	return initPromise as Promise<void>;
}

/**
 * Score how visibly `distorted` differs from `reference` with MILO.
 *
 * Both buffers must be `width * height * 4` bytes in RGBA8 order, at least
 * 16px on each side. Decode PNG/JPEG with `createImageBitmap` +
 * `OffscreenCanvas.getImageData()` (or the `ImageDecoder` API) and pass the
 * resulting `Uint8Array` here.
 *
 * Returns the same numbers as `@blazediff/milo-native`: it is the same Rust
 * metric, run on one thread.
 */
export async function milo(
	reference: Uint8Array,
	distorted: Uint8Array,
	width: number,
	height: number,
	options: MiloOptions = {},
): Promise<MiloResult> {
	await initMilo();
	const raw = (wasmMiloRgba as unknown as WasmMiloRgba)(
		reference,
		distorted,
		width,
		height,
	);
	try {
		return {
			rawError: raw.rawError,
			mos: raw.mos,
			width: raw.width,
			height: raw.height,
			...(options.returnMaps
				? { mask: raw.mask(), errorMap: raw.errorMap() }
				: {}),
		};
	} finally {
		// The result owns two per-pixel maps inside wasm linear memory, which
		// never shrinks; release them rather than wait for the finalizer.
		raw.free();
	}
}
