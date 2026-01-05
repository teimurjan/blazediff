import { existsSync, mkdirSync } from "node:fs";
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

	await pngjsTransformer.write({ data, width, height }, filePath);
}

/**
 * Normalize image input to ImageData
 * If input is a file path, loads the image
 * If input is already a buffer, returns it with normalized Uint8Array
 */
export async function normalizeImageInput(
	input: ImageInput,
): Promise<ImageData> {
	if (isFilePath(input)) {
		return loadPNG(input);
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
