import { isFilePath, isImageData, normalizeImageInput } from "../image-io";
import type {
	ComparisonMethod,
	ImageData,
	ImageInput,
	MatcherOptions,
} from "../types";
import { compareCore } from "./core";
import { compareBin } from "./core-native";
import { compareGmsd } from "./gmsd";
import { compareSsim, isSsimMethod } from "./ssim";

export interface RunComparisonResult {
	/** Number of different pixels (for pixel-based methods) */
	diffCount?: number;

	/** Percentage of different pixels */
	diffPercentage?: number;

	/** Score for perceptual methods (SSIM: 1=identical, GMSD: 0=identical) */
	score?: number;

	/** Diff visualization output buffer */
	diffOutput?: Uint8Array;
}

/**
 * Validate that the comparison method supports the given input type
 */
export function validateMethodSupportsInput(
	method: ComparisonMethod,
	input: ImageInput,
): void {
	if (method === "core-native" && !isFilePath(input)) {
		throw new Error(
			`Method 'core-native' only supports file paths, but received a buffer. ` +
				`Use method 'core', 'ssim', or 'gmsd' for buffer inputs.`,
		);
	}
}

/**
 * Run comparison using the specified method
 */
export async function runComparison(
	received: ImageInput,
	baseline: ImageInput,
	method: ComparisonMethod,
	options: MatcherOptions,
	diffOutputPath?: string,
): Promise<RunComparisonResult> {
	// Validate input types for the method
	validateMethodSupportsInput(method, received);
	validateMethodSupportsInput(method, baseline);

	// Handle core-native method separately (file paths only)
	if (method === "core-native") {
		const result = await compareBin(
			received,
			baseline,
			diffOutputPath,
			options,
		);
		return {
			diffCount: result.diffCount,
			diffPercentage: result.diffPercentage,
		};
	}

	// For all other methods, normalize to ImageData (skip if already ImageData)
	const receivedData: ImageData = isImageData(received)
		? received
		: await normalizeImageInput(received);
	const baselineData: ImageData = isImageData(baseline)
		? baseline
		: await normalizeImageInput(baseline);
	const generateDiff = diffOutputPath !== undefined;

	// SSIM variants
	if (isSsimMethod(method)) {
		const result = compareSsim(
			receivedData,
			baselineData,
			method,
			generateDiff,
			options,
		);
		return {
			score: result.score,
			diffOutput: result.diffOutput,
		};
	}

	// GMSD
	if (method === "gmsd") {
		const result = compareGmsd(
			receivedData,
			baselineData,
			generateDiff,
			options,
		);
		return {
			score: result.score,
			diffOutput: result.diffOutput,
		};
	}

	// Core (pixel-by-pixel)
	const result = compareCore(receivedData, baselineData, generateDiff, options);
	return {
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		diffOutput: result.diffOutput,
	};
}

export { compareCore } from "./core";
export { compareBin } from "./core-native";
export { compareGmsd } from "./gmsd";
export { compareSsim, isSsimMethod } from "./ssim";
