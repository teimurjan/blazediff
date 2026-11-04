import type { DiffResult } from "@blazediff/core";
import type { ImageData } from "../types";

export interface PixelComparisonResult {
	diffCount: number;
	diffPercentage: number;
	diffOutput?: Uint8Array;
}

/** Maps a diff result onto the matcher's counts; a size change fails every pixel. */
export function toPixelResult(
	result: DiffResult,
	output?: ImageData,
): PixelComparisonResult {
	if (result.kind === "dimension-mismatch") {
		const { a, b } = result;
		return {
			diffCount: Math.max(a.width * a.height, b.width * b.height),
			diffPercentage: 100,
		};
	}
	return {
		diffCount: result.count,
		diffPercentage: result.percentage,
		diffOutput: output?.data,
	};
}

export function blankLike({ width, height }: ImageData): ImageData {
	return { data: new Uint8Array(width * height * 4), width, height };
}
