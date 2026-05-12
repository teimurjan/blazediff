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
}

export type JudgmentRequestRegion = RegionSummary;

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
	  };

export interface Judge {
	readonly name: string;
	judge(input: JudgeInput, cwd: string): Promise<JudgeOutput>;
}

export type JudgeBackend = "none" | "host";
