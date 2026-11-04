import { ssim } from "@blazediff/ssim";
import { hitchhikersSSIM } from "@blazediff/ssim/hitchhikers-ssim";
import { msssim } from "@blazediff/ssim/msssim";
import type { ComparisonMethod, ImageData, MatcherOptions } from "../types";
import { blankLike } from "./pixel-result";

export interface SsimComparisonResult {
	score: number;
	diffOutput?: Uint8Array;
}

type SsimMethod = "ssim" | "msssim" | "hitchhikers-ssim";

const SSIM_FUNCTIONS = {
	ssim,
	msssim,
	"hitchhikers-ssim": hitchhikersSSIM,
} as const;

/** SSIM score (0-1, 1 = identical); a size change scores 0. */
export function compareSsim(
	received: ImageData,
	baseline: ImageData,
	method: SsimMethod,
	generateDiff: boolean,
	options: MatcherOptions,
): SsimComparisonResult {
	const output = generateDiff ? blankLike(received) : undefined;
	const result = SSIM_FUNCTIONS[method](received, baseline, {
		...options.ssim,
		output,
	});
	if (result.kind === "dimension-mismatch") return { score: 0 };
	return { score: result.score, diffOutput: output?.data };
}

export function isSsimMethod(method: ComparisonMethod): method is SsimMethod {
	return method in SSIM_FUNCTIONS;
}
