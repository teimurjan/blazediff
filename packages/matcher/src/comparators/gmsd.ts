import { gmsd } from "@blazediff/gmsd";
import type { ImageData, MatcherOptions } from "../types";

export interface GmsdComparisonResult {
	score: number;
	diffOutput?: Uint8Array;
}

/**
 * Compare images using @blazediff/gmsd (Gradient Magnitude Similarity Deviation)
 * Returns GMSD score (0 = identical, higher = more different)
 */
export function compareGmsd(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): GmsdComparisonResult {
	const { width, height } = received;
	const totalPixels = width * height;

	// Validate dimensions match
	if (
		received.width !== baseline.width ||
		received.height !== baseline.height
	) {
		// Return high score indicating major difference
		return { score: 1 };
	}

	const output = generateDiff ? new Uint8Array(totalPixels * 4) : undefined;

	const score = gmsd(received.data, baseline.data, output, width, height, {
		downsample: options.downsample,
	});

	return { score, diffOutput: output };
}
