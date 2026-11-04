import { diff } from "@blazediff/core";
import type { ImageData, MatcherOptions } from "../types";
import {
	blankLike,
	type PixelComparisonResult,
	toPixelResult,
} from "./pixel-result";

/** Compare images using @blazediff/core (pixel by pixel in JavaScript). */
export function compareCore(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): PixelComparisonResult {
	const output = generateDiff ? blankLike(received) : undefined;
	return toPixelResult(
		diff(received, baseline, { ...options.diff, output }),
		output,
	);
}
