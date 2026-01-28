import { compare } from "@blazediff/bin";
import { isFilePath } from "../image-io";
import type { ImageInput, MatcherOptions } from "../types";

export interface BinComparisonResult {
	diffCount: number;
	diffPercentage: number;
}

/**
 * Compare images using @blazediff/bin (Rust N-API)
 * Only supports file paths - throws if buffer is provided
 */
export async function compareBin(
	received: ImageInput,
	baseline: ImageInput,
	diffOutputPath: string | undefined,
	options: MatcherOptions,
): Promise<BinComparisonResult> {
	if (!isFilePath(received)) {
		throw new Error(
			"Method 'bin' only supports file paths, but received a buffer. " +
				"Use method 'core', 'ssim', or 'gmsd' for buffer inputs.",
		);
	}

	if (!isFilePath(baseline)) {
		throw new Error(
			"Method 'bin' only supports file paths for baseline, but received a buffer. " +
				"Use method 'core', 'ssim', or 'gmsd' for buffer inputs.",
		);
	}

	const result = await compare(received, baseline, diffOutputPath, {
		threshold: options.threshold,
		antialiasing: options.antialiasing,
	});

	if (result.match) {
		return { diffCount: 0, diffPercentage: 0 };
	}

	if (result.reason === "layout-diff") {
		return { diffCount: Number.MAX_SAFE_INTEGER, diffPercentage: 100 };
	}

	if (result.reason === "pixel-diff") {
		return {
			diffCount: result.diffCount,
			diffPercentage: result.diffPercentage,
		};
	}

	if (result.reason === "file-not-exists") {
		throw new Error(`Image file not found: ${result.file}`);
	}

	return { diffCount: 0, diffPercentage: 0 };
}
