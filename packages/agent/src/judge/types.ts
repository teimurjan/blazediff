import type { Verdict } from "../diff/verdict";
import type { ManifestEntry, RegionSummary } from "../types";

export interface JudgeInput {
	entry: ManifestEntry;
	baselinePath: string;
	actualPath: string;
	diffPath?: string;
	regions?: RegionSummary[];
	diffPercentage?: number;
	severity?: string;
	heuristicVerdict: Verdict;
	/**
	 * Fired the moment the judge starts real work on this test, *after* any
	 * internal queueing (e.g. waiting on a single-instance ML model). The CLI
	 * uses this to print the "judging X" line at the correct pipeline moment
	 * rather than when the call was merely scheduled.
	 */
	onJudgingStart?: () => void;
}

export type JudgmentRequestRegion = RegionSummary;

export type JudgeFailureReason = "model-load" | "read" | "internal";

export type JudgeOutput =
	| {
			kind: "judged";
			verdict: Verdict;
			rationale?: string;
			confidence?: number;
	  }
	| {
			kind: "deferred";
			requestPath: string;
	  }
	| {
			/**
			 * The judge could not produce a verdict (model load failed, crop read
			 * threw, …). `fallback` is the deterministic heuristic verdict the
			 * caller should adopt; `error` is the originating error for diagnostics.
			 */
			kind: "failed";
			reason: JudgeFailureReason;
			error: Error;
			fallback: Verdict;
	  };

export interface Judge {
	readonly name: string;
	judge(input: JudgeInput, cwd: string): Promise<JudgeOutput>;
	/**
	 * Optional one-time load step (e.g. streaming model weights). Run once after
	 * capture and before judging so the cost surfaces as its own phase instead of
	 * stalling the first test silently.
	 */
	warmup?(): Promise<void>;
}

export type JudgeBackend = "none" | "host" | "local";

export interface VerdictFile {
	id: string;
	verdict: Verdict;
	rationale?: string;
	confidence?: number;
}
