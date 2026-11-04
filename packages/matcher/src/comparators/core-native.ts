import { diff } from "@blazediff/core-native";
import type { ImageInput, MatcherOptions } from "../types";
import { type PixelComparisonResult, toPixelResult } from "./pixel-result";

/**
 * Compare images using @blazediff/core-native (Rust N-API). Takes paths,
 * encoded PNG buffers and raw RGBA images, and writes the diff PNG itself.
 */
export async function compareCoreNative(
	received: ImageInput,
	baseline: ImageInput,
	diffOutputPath: string | undefined,
	options: MatcherOptions,
): Promise<PixelComparisonResult> {
	const result = await diff(received, baseline, {
		...options.diff,
		output: diffOutputPath,
	});
	if (result.kind === "io-error") {
		throw new Error(
			result.path
				? `Image file not found or unreadable: ${result.path}. ${result.message}`
				: result.message,
		);
	}
	return toPixelResult(result);
}
