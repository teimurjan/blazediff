import { gmsd } from "@blazediff/gmsd";
import type { ImageData, MatcherOptions } from "../types";
import { blankLike } from "./pixel-result";

export interface GmsdComparisonResult {
	score: number;
	diffOutput?: Uint8Array;
}

/** GMSD score (0 = identical, higher = more different); a size change scores 1. */
export function compareGmsd(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): GmsdComparisonResult {
	const output = generateDiff ? blankLike(received) : undefined;
	const result = gmsd(received, baseline, { ...options.gmsd, output });
	if (result.kind === "dimension-mismatch") return { score: 1 };
	return { score: result.score, diffOutput: output?.data };
}
