import type { BlazeDiffImage, BlazeDiffOptions } from "@blazediff/types";

// Dynamic import to handle different environments
const wasmModule: any = null;
let wasmBlazediff: any = null;
let WasmBlazeDiffOptions: any = null;

let wasmInitialized = false;

/**
 * Initialize the WASM module
 */
async function initWasm(): Promise<void> {
	if (!wasmInitialized && !wasmModule) {
		try {
			// Import the WASM module using a more robust path resolution
			const path = require("node:path");

			let blazediffWasm: any;
			const possiblePaths = [
				// When running from the dist directory of this package
				path.join(__dirname, "blazediff_wasm.js"),
				// When running from node_modules
				path.join(__dirname, "..", "dist", "blazediff_wasm.js"),
				// When in development from the benchmark
				path.join(__dirname, "..", "..", "wasm", "dist", "blazediff_wasm.js"),
				// Fallback to pkg directory for development
				path.join(__dirname, "..", "pkg", "blazediff_wasm.js"),
			];

			let lastError: any;
			for (const wasmPath of possiblePaths) {
				try {
					blazediffWasm = require(wasmPath);
					break;
				} catch (error) {
					lastError = error;
				}
			}

			if (!blazediffWasm) {
				throw new Error(
					`Failed to load WASM module from any path. Last error: ${lastError}`,
				);
			}
			wasmBlazediff = blazediffWasm.blazediff;
			WasmBlazeDiffOptions = blazediffWasm.BlazeDiffOptions;
			wasmInitialized = true;
		} catch (error) {
			throw new Error(`Failed to initialize WASM module: ${error}`);
		}
	}
}

/**
 * Convert TypeScript options to WASM options
 */
function convertOptionsToWasm(options: BlazeDiffOptions): any {
	if (!WasmBlazeDiffOptions) {
		throw new Error(
			"WASM module not initialized. Call initBlazeDiffWasm() first.",
		);
	}
	const wasmOptions = new WasmBlazeDiffOptions();

	if (options.threshold !== undefined) {
		wasmOptions.threshold = options.threshold;
	}
	if (options.alpha !== undefined) {
		wasmOptions.alpha = options.alpha;
	}
	if (options.includeAA !== undefined) {
		wasmOptions.include_aa = options.includeAA;
	}
	if (options.diffMask !== undefined) {
		wasmOptions.diff_mask = options.diffMask;
	}

	return wasmOptions;
}

/**
 * WASM-accelerated image comparison with SIMD optimizations
 *
 * @param image1 First image data
 * @param image2 Second image data
 * @param output Optional output buffer for diff visualization
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param options Comparison options
 * @returns Number of different pixels
 */
export default async function blazediff(
	image1: BlazeDiffImage["data"],
	image2: BlazeDiffImage["data"],
	output: BlazeDiffImage["data"] | undefined,
	width: number,
	height: number,
	options: BlazeDiffOptions = {},
): Promise<number> {
	// Initialize WASM module if needed
	await initWasm();

	// Validate input parameters
	if (!isValidBlazeDiffImage(image1) || !isValidBlazeDiffImage(image2)) {
		throw new Error(
			"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
		);
	}

	if (output && !isValidBlazeDiffImage(output)) {
		throw new Error(
			"Output data: Uint8Array, Uint8ClampedArray or Buffer expected.",
		);
	}

	if (
		image1.length !== image2.length ||
		(output && output.length !== image1.length)
	) {
		throw new Error(
			`Image sizes do not match. Image 1 size: ${image1.length}, image 2 size: ${image2.length}`,
		);
	}

	if (image1.length !== width * height * 4) {
		throw new Error(
			`Image data size does not match width/height. Expecting ${
				width * height * 4
			}. Got ${image1.length}`,
		);
	}

	// Convert options to WASM format
	const wasmOptions = convertOptionsToWasm(options);
	// Ensure WASM functions are available
	if (!wasmBlazediff) {
		throw new Error(
			"WASM module not initialized. Call initBlazeDiffWasm() first.",
		);
	}

	// Call unified WASM function
	const result = wasmBlazediff(
		image1,
		image2,
		width,
		height,
		wasmOptions,
		!!output, // output_needed boolean
	);

	// Extract diff count
	const diffCount = result.diff;

	// Copy output buffer if needed
	if (output && result.output) {
		const outputArray = result.output;

		// Copy back to original output buffer efficiently
		if (output instanceof Uint8Array) {
			output.set(outputArray);
		} else if (output instanceof Uint8ClampedArray) {
			output.set(outputArray);
		} else {
			// Buffer or other array-like
			for (let i = 0; i < outputArray.length; i++) {
				(output as any)[i] = outputArray[i];
			}
		}
	}

	return diffCount;
}

/**
 * Initialize WASM module manually
 */
export async function initBlazeDiffWasm(): Promise<void> {
	await initWasm();
}

/**
 * Check if WASM module is initialized
 */
export function isWasmInitialized(): boolean {
	return wasmInitialized;
}

/** Check if array is valid pixel data */
function isValidBlazeDiffImage(arr: unknown): arr is BlazeDiffImage["data"] {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}
