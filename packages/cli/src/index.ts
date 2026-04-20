// Types only - no algorithm imports to keep the bundle small

import type { Buffer } from "node:buffer";
export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Codec {
	read: (input: string | Buffer) => Promise<Image>;
	write: (image: Image, output: string | Buffer) => Promise<void>;
}

export type ComparisonMode = "diff" | "gmsd" | "ssim" | "msssim";

export interface DiffModeOptions {
	outputPath?: string;
	codec: Codec;
	mode?: "diff";
	options?: Record<string, unknown>;
}

export interface GmsdModeOptions {
	outputPath?: string;
	codec: Codec;
	mode: "gmsd";
	options?: Record<string, unknown>;
}

export interface SsimModeOptions {
	outputPath?: string;
	codec: Codec;
	mode: "ssim";
	options?: Record<string, unknown>;
}

export interface MsssimModeOptions {
	outputPath?: string;
	codec: Codec;
	mode: "msssim";
	options?: Record<string, unknown>;
}

export interface DiffModeResult {
	mode: "diff";
	diffCount: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export interface GmsdModeResult {
	mode: "gmsd";
	score: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export interface SsimModeResult {
	mode: "ssim";
	score: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export interface MsssimModeResult {
	mode: "msssim";
	score: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export type BlazeDiffCoreNativeResult =
	| DiffModeResult
	| GmsdModeResult
	| SsimModeResult
	| MsssimModeResult;
