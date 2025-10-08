/**
 * Shared types for the BlazeDiff project
 */

/**
 * Image data structure
 */
export interface BlazeDiffImage {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

/**
 * BlazeDiffTransformer to transform images to a common format & write the output image
 */
export interface BlazeDiffTransformer {
	transform: (input: string | Buffer) => Promise<BlazeDiffImage>;
	write: (image: BlazeDiffImage, output: string | Buffer) => Promise<void>;
}

/**
 * Core BlazeDiff algorithm options
 */
export interface BlazeDiffOptions {
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	aaColor?: [number, number, number];
	diffColor?: [number, number, number];
	diffColorAlt?: [number, number, number];
	diffMask?: boolean;
	fastBufferCheck?: boolean;
}
