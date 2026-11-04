import type { SsimResult } from "./types";

/** The score of a same-size comparison; throws on a dimension mismatch. */
export function scoreOf(result: SsimResult): number {
	if (result.kind !== "compared") throw new Error("Image sizes differ");
	return result.score;
}
