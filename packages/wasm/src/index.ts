export interface BlazeDiffOptions {
	threshold?: number;
	alpha?: number;
	aaColor?: [number, number, number];
	diffColor?: [number, number, number];
	diffColorAlt?: [number, number, number];
	includeAA?: boolean;
	diffMask?: boolean;
}

interface WasmModule {
	BlazeDiff: new () => BlazeDiffInstance;
}

interface BlazeDiffInstance {
	diff(
		img1: Uint8Array | Uint8ClampedArray,
		img2: Uint8Array | Uint8ClampedArray,
		output: Uint8Array | Uint8ClampedArray,
		hasOutput: boolean,
		width: number,
		height: number,
		threshold: number,
		alpha: number,
		aaColorR: number,
		aaColorG: number,
		aaColorB: number,
		diffColorR: number,
		diffColorG: number,
		diffColorB: number,
		diffColorAltR: number,
		diffColorAltG: number,
		diffColorAltB: number,
		includeAA: boolean,
		diffMask: boolean,
	): number;
}

let wasmModule: WasmModule | null = null;
let blazeDiffInstance: BlazeDiffInstance | null = null;

export async function initWasm(): Promise<void> {
	if (wasmModule) {
		return;
	}

	// Dynamic import of the WASM module
	const wasm = await import("../pkg/blazediff_wasm.js");

	// For nodejs target, no need to call init
	wasmModule = wasm;
	// Create a single reusable instance
	blazeDiffInstance = new wasm.BlazeDiff();
}

export function blazediffSync(
	img1: Uint8Array | Uint8ClampedArray,
	img2: Uint8Array | Uint8ClampedArray,
	output: Uint8Array | Uint8ClampedArray | null,
	width: number,
	height: number,
	options: BlazeDiffOptions = {},
): number {
	if (!blazeDiffInstance) {
		throw new Error("WASM not initialized. Call initWasm() first.");
	}

	const {
		threshold = 0.1,
		alpha = 0.1,
		aaColor = [255, 255, 0],
		diffColor = [255, 0, 0],
		diffColorAlt,
		includeAA = false,
		diffMask = false,
	} = options;

	const [aaR, aaG, aaB] = aaColor;
	const [diffR, diffG, diffB] = diffColor;
	const [altR, altG, altB] = diffColorAlt || diffColor;

	// Create or reuse dummy output buffer if no output is needed
	const hasOutput = output !== null;

	// Rust WASM operates directly on the TypedArrays - zero copy!
	return blazeDiffInstance.diff(
		img1,
		img2,
		output ?? new Uint8Array(0),
		hasOutput,
		width,
		height,
		threshold,
		alpha,
		aaR,
		aaG,
		aaB,
		diffR,
		diffG,
		diffB,
		altR,
		altG,
		altB,
		includeAA,
		diffMask,
	);
}

export async function blazediff(
	img1: Uint8Array | Uint8ClampedArray,
	img2: Uint8Array | Uint8ClampedArray,
	output: Uint8Array | Uint8ClampedArray | null,
	width: number,
	height: number,
	options: BlazeDiffOptions = {},
): Promise<number> {
	await initWasm();
	return blazediffSync(img1, img2, output, width, height, options);
}

export default blazediff;
