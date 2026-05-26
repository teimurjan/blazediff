import { Annotation } from "@langchain/langgraph";
import type { DiffOutcome } from "../diff";
import type { JudgeBackend } from "../judge";
import type {
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
}

export interface CaptureOutput {
	id: string;
	captureOutputPath?: string;
	baselinePath?: string;
	skipResult?: CheckResult;
}

// One screenshot (base or harness-derived sub-shot) ready to diff+judge. The
// capture phase emits these into the shared `captured` channel; the dispatch
// node fans one diff/judge branch out per item.
export interface CapturedEntry {
	entry: ManifestEntry;
	output: CaptureOutput;
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

const capturedChannel = Annotation<CapturedEntry[]>({
	reducer: (acc, next) => [...acc, ...next],
	default: () => [],
});

// Per-base-entry capture state. Each Send-fanned invocation runs the harnesses
// for one base entry and writes its base + sub-shots into the shared `captured`
// channel, which the parent graph aggregates.
export const CaptureState = Annotation.Root({
	entry: Annotation<ManifestEntry | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	children: Annotation<ManifestEntry[]>({
		reducer: (_, next) => next,
		default: () => [],
	}),
	options: Annotation<GraphOptions | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	captured: capturedChannel,
});

export type CaptureStateType = typeof CaptureState.State;

// Per-screenshot diff/judge state. Capture already happened, so the branch
// receives a captureOutput via the Send payload and only diffs + judges.
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

// Top-level state. `captured` and `results` are shared by name with the
// subgraph states, so their appends bubble up automatically.
export const GraphState = Annotation.Root({
	options: Annotation<GraphOptions | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	entries: Annotation<ManifestEntry[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	}),
	captured: capturedChannel,
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
