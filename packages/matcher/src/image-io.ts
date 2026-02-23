import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pngjsTransformer } from "@blazediff/pngjs-transformer";
import type { ImageData, ImageInput } from "./types";

/**
 * Check if input is a file path
 */
export function isFilePath(input: ImageInput): input is string {
	return typeof input === "string";
}

/**
 * Check if input is a raw PNG buffer (Buffer or Uint8Array without dimensions)
 */
export function isRawPngBuffer(
	input: ImageInput,
): input is Buffer | Uint8Array {
	return (
		(Buffer.isBuffer(input) || input instanceof Uint8Array) &&
		!("width" in input)
	);
}

/**
 * Check if input is an image buffer with dimensions
 */
export function isImageBuffer(input: ImageInput): input is {
	data: Uint8Array | Uint8ClampedArray | Buffer;
	width: number;
	height: number;
} {
	return (
		typeof input === "object" &&
		input !== null &&
		"data" in input &&
		"width" in input &&
		"height" in input
	);
}

/**
 * Type guard for ImageData
 */
export function isImageData(input: ImageInput): input is ImageData {
	return (
		typeof input === "object" &&
		input !== null &&
		"data" in input &&
		"width" in input &&
		"height" in input
	);
}

/**
 * Load a PNG image from file path
 */
export async function loadPNG(filePath: string): Promise<ImageData> {
	if (!existsSync(filePath)) {
		throw new Error(`Image file not found: ${filePath}`);
	}

	const image = await pngjsTransformer.read(filePath);
	return {
		data: new Uint8Array(image.data),
		width: image.width,
		height: image.height,
	};
}

/**
 * Save image data to a PNG file
 */
export async function savePNG(
	filePath: string,
	data: Uint8Array | Uint8ClampedArray | Buffer,
	width: number,
	height: number,
): Promise<void> {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	await pngjsTransformer.write(
		{ data: data instanceof Uint8Array ? data : new Uint8Array(data), width, height },
		filePath,
	);
}

/**
 * Save a raw PNG buffer directly to file (no decode/encode cycle)
 */
export function saveRawPNGBuffer(
	filePath: string,
	buffer: Buffer | Uint8Array,
): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(filePath, buffer);
}

/**
 * Normalize image input to ImageData
 * - File path: loads the PNG
 * - Raw PNG buffer: decodes to get dimensions
 * - Buffer with dimensions: returns as-is (avoids unnecessary copy if already Uint8Array)
 */
export async function normalizeImageInput(input: ImageInput): Promise<ImageData> {
	if (isFilePath(input)) {
		return loadPNG(input);
	}

	if (isRawPngBuffer(input)) {
		const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
		const image = await pngjsTransformer.read(buffer);
		return {
			data: new Uint8Array(image.data),
			width: image.width,
			height: image.height,
		};
	}

	// If already ImageData with Uint8Array, return as-is to avoid unnecessary copy
	if (input.data instanceof Uint8Array) {
		return input as ImageData;
	}

	return {
		data: new Uint8Array(input.data),
		width: input.width,
		height: input.height,
	};
}

/**
 * Check if a file exists
 */
export function fileExists(filePath: string): boolean {
	return existsSync(filePath);
}

/**
 * Ensure directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath, { recursive: true });
	}
}
