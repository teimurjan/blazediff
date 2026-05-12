import { Annotation } from "@langchain/langgraph";
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

export const GraphState = Annotation.Root({
	options: Annotation<GraphOptions | undefined>({
		reducer: (acc, next) => next ?? acc,
		default: () => undefined,
	}),
	entries: Annotation<ManifestEntry[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	}),
	entry: Annotation<ManifestEntry | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	results: Annotation<CheckResult[]>({
		reducer: (acc, next) => [...acc, ...next],
		default: () => [],
	}),
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
