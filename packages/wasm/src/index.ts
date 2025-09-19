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
	allocateBuffer: (size: number) => number;
	freeBuffer: (ptr: number) => void;
	blazediff: (
		img1: number,
		img2: number,
		output: number,
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
	) => number;
	memory: WebAssembly.Memory;
}

let wasmModule: WasmModule | null = null;

async function initWasm(): Promise<WasmModule> {
	if (wasmModule) {
		return wasmModule;
	}

	// Dynamic import to avoid top-level await issues
	const wasmExports = await import("../build/release.js");

	wasmModule = {
		allocateBuffer: wasmExports.allocateBuffer,
		freeBuffer: wasmExports.freeBuffer,
		blazediff: wasmExports.blazediff,
		memory: wasmExports.memory,
	};

	return wasmModule;
}

export async function blazediff(
	img1: Uint8Array | Uint8ClampedArray,
	img2: Uint8Array | Uint8ClampedArray,
	output: Uint8Array | Uint8ClampedArray | null,
	width: number,
	height: number,
	options: BlazeDiffOptions = {},
): Promise<number> {
	const {
		threshold = 0.1,
		alpha = 0.1,
		aaColor = [255, 255, 0],
		diffColor = [255, 0, 0],
		diffColorAlt,
		includeAA = false,
		diffMask = false,
	} = options;

	// Initialize WASM module
	const wasm = await initWasm();

	const pixelCount = width * height;
	const dataSize = pixelCount * 4; // 4 bytes per pixel (RGBA)

	// Validate input sizes
	if (img1.length !== dataSize || img2.length !== dataSize) {
		throw new Error(
			`Expected image data size: ${dataSize}, got img1: ${img1.length}, img2: ${img2.length}`,
		);
	}

	if (output && output.length !== dataSize) {
		throw new Error(
			`Expected output data size: ${dataSize}, got: ${output.length}`,
		);
	}

	// Allocate memory in WASM
	const img1Ptr = wasm.allocateBuffer(dataSize);
	const img2Ptr = wasm.allocateBuffer(dataSize);
	const outputPtr = output ? wasm.allocateBuffer(dataSize) : 0;

	try {
		// Get memory view
		const memoryView = new Uint8Array(wasm.memory.buffer);

		// Copy data to WASM memory
		memoryView.set(img1, img1Ptr);
		memoryView.set(img2, img2Ptr);

		// Extract color components
		const [aaR, aaG, aaB] = aaColor;
		const [diffR, diffG, diffB] = diffColor;
		const [altR, altG, altB] = diffColorAlt || diffColor;

		// Run blazediff
		const diffCount = wasm.blazediff(
			img1Ptr,
			img2Ptr,
			outputPtr,
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

		// Copy output back if provided
		if (output && outputPtr) {
			const outputData = memoryView.subarray(outputPtr, outputPtr + dataSize);
			output.set(outputData);
		}

		return diffCount;
	} finally {
		// Clean up allocated memory
		wasm.freeBuffer(img1Ptr);
		wasm.freeBuffer(img2Ptr);
		if (outputPtr) {
			wasm.freeBuffer(outputPtr);
		}
	}
}

export default blazediff;
