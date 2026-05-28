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

// "Latest wins" channel: overwrite on each update, default to undefined.
const latest = <T>() =>
	Annotation<T | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	});

// "Append" channel: concatenate each branch's contribution, default to empty.
const appendList = <T>() =>
	Annotation<T[]>({
		reducer: (acc, next) => [...acc, ...next],
		default: () => [],
	});

// "Replace" channel: each write replaces, but null/undefined keeps the prior
// value. Used for non-optional list channels seeded once by the load node.
const replaceList = <T>() =>
	Annotation<T[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	});

const resultsChannel = appendList<CheckResult>();
const capturedChannel = appendList<CapturedEntry>();

// Per-base-entry capture state. Each Send-fanned invocation runs the harnesses
// for one base entry and writes its base + sub-shots into the shared `captured`
// channel, which the parent graph aggregates.
export const CaptureState = Annotation.Root({
	entry: latest<ManifestEntry>(),
	children: Annotation<ManifestEntry[]>({
		reducer: (_, next) => next,
		default: () => [],
	}),
	options: latest<GraphOptions>(),
	captured: capturedChannel,
});

export type CaptureStateType = typeof CaptureState.State;

// Per-screenshot diff/judge state. Capture already happened, so the branch
// receives a captureOutput via the Send payload and only diffs + judges.
export const BranchState = Annotation.Root({
	entry: latest<ManifestEntry>(),
	options: latest<GraphOptions>(),
	captureOutput: latest<CaptureOutput>(),
	diffOutput: latest<DiffOutput>(),
	results: resultsChannel,
});

export type BranchStateType = typeof BranchState.State;

// Top-level state. `captured` and `results` are shared by name with the
// subgraph states, so their appends bubble up automatically.
export const GraphState = Annotation.Root({
	options: latest<GraphOptions>(),
	entries: replaceList<ManifestEntry>(),
	captured: capturedChannel,
	results: resultsChannel,
	manifest: latest<Manifest>(),
	report: latest<CheckReport>(),
});

export type GraphStateType = typeof GraphState.State;
