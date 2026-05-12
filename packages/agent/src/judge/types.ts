import type { BoundingBox, ChangeRegion } from "@blazediff/core-native";
import type { Verdict } from "../diff/verdict";
import type { ManifestEntry } from "../types";

export interface JudgeInput {
	entry: ManifestEntry;
	baselinePath: string;
	actualPath: string;
	diffPath?: string;
	regions?: ChangeRegion[];
	diffPercentage?: number;
	severity?: string;
	heuristicVerdict: Verdict;
}

export interface JudgmentRequestRegion {
	bbox: BoundingBox;
	pixelCount: number;
	percentage: number;
	changeType: string;
	confidence: number;
	tilePath?: string;
}

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
