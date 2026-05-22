import { Annotation } from "@langchain/langgraph";
import type { DiffOutcome } from "../diff";
import type { JudgeBackend } from "../judge";
import type {
	AgentAuthConfig,
	CheckReport,
	CheckResult,
	Manifest,
	ManifestEntry,
} from "../types";

export interface GraphOptions {
	baseUrl: string;
	cwd: string;
	threshold?: number;
	concurrency: number;
	emitDiffPng: boolean;
	judge: JudgeBackend;
	baselinesDir: string;
	auth?: AgentAuthConfig;
}

export interface CaptureOutput {
	id: string;
	captureOutputPath?: string;
	baselinePath?: string;
	skipResult?: CheckResult;
}

export interface DiffOutput {
	id: string;
	outcome?: DiffOutcome;
	baselinePath?: string;
	captureOutputPath?: string;
	skipResult?: CheckResult;
}

const resultsChannel = Annotation<CheckResult[]>({
	reducer: (acc, next) => [...acc, ...next],
	default: () => [],
});

// Per-entry pipeline state. Each Send-fanned branch runs the capture → diff →
// judge subgraph against its own copy of this state — intermediate channels
// (captureOutput, diffOutput) never race because they live inside the branch.
// Only `results` is shared with the parent and merges via the append reducer.
export const BranchState = Annotation.Root({
	entry: Annotation<ManifestEntry | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	options: Annotation<GraphOptions | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	captureOutput: Annotation<CaptureOutput | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	diffOutput: Annotation<DiffOutput | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	results: resultsChannel,
});

export type BranchStateType = typeof BranchState.State;

// Top-level state. `results` is shared with `BranchState` by name, so each
// branch's emitted result appends into this channel automatically when the
// subgraph node returns.
export const GraphState = Annotation.Root({
	options: Annotation<GraphOptions | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	entries: Annotation<ManifestEntry[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	}),
	results: resultsChannel,
	manifest: Annotation<Manifest | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	report: Annotation<CheckReport | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
});

export type GraphStateType = typeof GraphState.State;
