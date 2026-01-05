import { ssim } from "@blazediff/ssim";
import { hitchhikersSSIM } from "@blazediff/ssim/hitchhikers-ssim";
import { msssim } from "@blazediff/ssim/msssim";
import type { ComparisonMethod, ImageData, MatcherOptions } from "../types";

export interface SsimComparisonResult {
	score: number;
	diffOutput?: Uint8Array;
}

type SsimMethod = "ssim" | "msssim" | "hitchhikers-ssim";

/**
 * Compare images using @blazediff/ssim variants
 * Returns SSIM score (0-1, where 1 = identical)
 */
export function compareSsim(
	received: ImageData,
	baseline: ImageData,
	method: SsimMethod,
	generateDiff: boolean,
	options: MatcherOptions,
): SsimComparisonResult {
	const { width, height } = received;
	const totalPixels = width * height;

	// Validate dimensions match
	if (
		received.width !== baseline.width ||
		received.height !== baseline.height
	) {
		return { score: 0 };
	}

	const output = generateDiff ? new Uint8Array(totalPixels * 4) : undefined;

	const ssimOptions = {
		windowSize: options.windowSize,
		k1: options.k1,
		k2: options.k2,
	};

	let score: number;

	switch (method) {
		case "ssim":
			score = ssim(
				received.data,
				baseline.data,
				output,
				width,
				height,
				ssimOptions,
			);
			break;

		case "msssim":
			score = msssim(
				received.data,
				baseline.data,
				output,
				width,
				height,
				ssimOptions,
			);
			break;

		case "hitchhikers-ssim":
			score = hitchhikersSSIM(
				received.data,
				baseline.data,
				output,
				width,
				height,
				ssimOptions,
			);
			break;

		default:
			throw new Error(`Unknown SSIM method: ${method}`);
	}

	return { score, diffOutput: output };
}

/**
 * Check if a method is an SSIM variant
 */
export function isSsimMethod(method: ComparisonMethod): method is SsimMethod {
	return (
		method === "ssim" || method === "msssim" || method === "hitchhikers-ssim"
	);
}
