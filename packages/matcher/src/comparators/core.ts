import { diff } from "@blazediff/core";
import type { ImageData, MatcherOptions } from "../types";

export interface CoreComparisonResult {
	diffCount: number;
	diffPercentage: number;
	diffOutput?: Uint8Array;
}

/**
 * Compare images using @blazediff/core (pixel-by-pixel YIQ)
 */
export function compareCore(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): CoreComparisonResult {
	const { width, height } = received;
	const totalPixels = width * height;

	// Validate dimensions match
	if (
		received.width !== baseline.width ||
		received.height !== baseline.height
	) {
		return {
			diffCount: totalPixels,
			diffPercentage: 100,
		};
	}

	const output = generateDiff ? new Uint8Array(totalPixels * 4) : undefined;

	const diffCount = diff(received.data, baseline.data, output, width, height, {
		threshold: options.threshold ?? 0.1,
		includeAA: options.includeAA ?? false,
	});

	return {
		diffCount,
		diffPercentage: (diffCount / totalPixels) * 100,
		diffOutput: output,
	};
}
