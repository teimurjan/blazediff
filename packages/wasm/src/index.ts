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

interface BufferPool {
	img1Ptr: number;
	img2Ptr: number;
	outputPtr: number;
	size: number;
	memoryView: Uint8Array;
}

let bufferPool: BufferPool | null = null;

const getWasmModule = () => {
	if (wasmModule) {
		return wasmModule;
	}
	throw new Error("Wasm module not initialized");
};

function ensureBufferPool(dataSize: number): BufferPool {
	const wasm = getWasmModule();

	if (
		bufferPool &&
		bufferPool.size >= dataSize &&
		bufferPool.memoryView.buffer === wasm.memory.buffer
	) {
		return bufferPool;
	}

	// Clean up old buffer pool if it exists
	if (bufferPool) {
		wasm.freeBuffer(bufferPool.img1Ptr);
		wasm.freeBuffer(bufferPool.img2Ptr);
		wasm.freeBuffer(bufferPool.outputPtr);
	}

	// Allocate new buffer pool
	bufferPool = {
		img1Ptr: wasm.allocateBuffer(dataSize),
		img2Ptr: wasm.allocateBuffer(dataSize),
		outputPtr: wasm.allocateBuffer(dataSize),
		size: dataSize,
		memoryView: new Uint8Array(wasm.memory.buffer),
	};

	return bufferPool;
}

export async function initWasm(): Promise<WasmModule> {
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

export async function blazediffAsync(
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

export function blazediffSync(
	img1: Uint8Array | Uint8ClampedArray,
	img2: Uint8Array | Uint8ClampedArray,
	output: Uint8Array | Uint8ClampedArray | null,
	width: number,
	height: number,
	options: BlazeDiffOptions = {},
): number {
	const {
		threshold = 0.1,
		alpha = 0.1,
		aaColor = [255, 255, 0],
		diffColor = [255, 0, 0],
		diffColorAlt,
		includeAA = false,
		diffMask = false,
	} = options;

	const pixelCount = width * height;
	const dataSize = pixelCount * 4; // 4 bytes per pixel (RGBA)

	const wasm = getWasmModule();

	// Validate input sizes
	if (img1.length !== dataSize || img2.length !== dataSize) {
		// Check if arrays are detached (WASM memory grew)
		if (img1.length === 0 || img2.length === 0) {
			throw new Error(
				`Array buffer detached - WASM memory may have grown. img1.length: ${img1.length}, img2.length: ${img2.length}, expected: ${dataSize}`,
			);
		}
		throw new Error(
			`Expected image data size: ${dataSize}, got img1: ${img1.length}, img2: ${img2.length}`,
		);
	}

	if (output && output.length !== dataSize) {
		throw new Error(
			`Expected output data size: ${dataSize}, got: ${output.length}`,
		);
	}

	// Use optimized buffer pool approach
	const pool = ensureBufferPool(dataSize);
	const { img1Ptr, img2Ptr, outputPtr, memoryView } = pool;

	// Copy data to WASM memory
	memoryView.set(img1, img1Ptr);
	memoryView.set(img2, img2Ptr);

	// Extract color components
	const aaR = aaColor[0];
	const aaG = aaColor[1];
	const aaB = aaColor[2];
	const diffR = diffColor[0];
	const diffG = diffColor[1];
	const diffB = diffColor[2];
	const altR = diffColorAlt ? diffColorAlt[0] : diffR;
	const altG = diffColorAlt ? diffColorAlt[1] : diffG;
	const altB = diffColorAlt ? diffColorAlt[2] : diffB;

	// Run blazediff
	const diffCount = wasm.blazediff(
		img1Ptr,
		img2Ptr,
		output ? outputPtr : 0,
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
	if (output) {
		const outputData = memoryView.subarray(outputPtr, outputPtr + dataSize);
		output.set(outputData);
	}

	return diffCount;
}

export default blazediffAsync;
