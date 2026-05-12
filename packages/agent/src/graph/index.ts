import { createHash } from "node:crypto";
import { availableParallelism, cpus } from "node:os";
import path from "node:path";
import { Command, END, Send, START, StateGraph } from "@langchain/langgraph";
import { closeBrowser } from "../browser/launch";
import { ensureGitignore } from "../cli/gitignore";
import { defaultConcurrency } from "../defaults";
import type { Verdict } from "../diff/verdict";
import { type JudgeBackend, writeJudgments } from "../judge";
import { loadManifest } from "../manifest";
import { paths } from "../paths";
import { writeJunit } from "../report/junit";
import { writeSummaryMarkdown } from "../report/markdown";
import type { CheckReport, CheckResult, Manifest } from "../types";
import { FsCheckpointSaver } from "./checkpoint";
import type { JudgmentInterrupt } from "./interrupt";
import { makeCaptureNode } from "./nodes/capture";
import { makeDiffNode } from "./nodes/diff";
import { judgeNode } from "./nodes/judge";
import { loadNode } from "./nodes/load";
import { Semaphore } from "./semaphore";
import { BranchState, GraphState, type GraphStateType } from "./state";

export type ResumeMap = Record<string, Verdict>;

export type RunEvent =
	| { type: "result"; result: CheckResult }
	| { type: "interrupt"; interrupt: JudgmentInterrupt }
	| { type: "report"; report: CheckReport };

export interface RunOptions {
	baseUrl?: string;
	cwd?: string;
	threshold?: number;
	concurrency?: number;
	emitDiffPng?: boolean;
	junitPath?: string;
	judge?: JudgeBackend;
	threadId?: string;
	onEvent?: (event: RunEvent) => void;
	resume?: ResumeMap;
}

export type CheckOptions = RunOptions;

function cpuParallelism(): number {
	const cores =
		typeof availableParallelism === "function"
			? availableParallelism()
			: cpus().length;
	if (!cores || !Number.isFinite(cores)) return 2;
	return Math.max(2, cores);
}

export function threadIdFor(cwd: string): string {
	return createHash("sha1")
		.update(paths(cwd).manifest)
		.digest("hex")
		.slice(0, 16);
}

function buildBranchGraph(
	captureSemaphore: Semaphore,
	diffSemaphore: Semaphore,
) {
	// Per-entry pipeline. Each Send invocation runs this subgraph against an
	// isolated copy of BranchState, so capture/diff outputs never collide
	// between branches. Only `results` is shared by name with the parent
	// schema, so the final 1-element array bubbles up via the append reducer.
	return new StateGraph(BranchState)
		.addNode("capture", makeCaptureNode(captureSemaphore))
		.addNode("diff", makeDiffNode(diffSemaphore))
		.addNode("judge", judgeNode)
		.addEdge(START, "capture")
		.addEdge("capture", "diff")
		.addEdge("diff", "judge")
		.addEdge("judge", END)
		.compile();
}

function buildGraph(
	captureSemaphore: Semaphore,
	diffSemaphore: Semaphore,
	checkpointer: FsCheckpointSaver,
) {
	const branch = buildBranchGraph(captureSemaphore, diffSemaphore);
	return new StateGraph(GraphState)
		.addNode("load", loadNode)
		.addNode("branch", branch)
		.addEdge(START, "load")
		.addConditionalEdges(
			"load",
			(state: GraphStateType) =>
				state.entries.map(
					(entry) => new Send("branch", { entry, options: state.options }),
				),
			["branch"],
		)
		.addEdge("branch", END)
		.compile({ checkpointer });
}

interface StreamCollect {
	results: CheckResult[];
	interrupts: JudgmentInterrupt[];
	manifest?: Manifest;
	report?: CheckReport;
}

async function streamGraph(
	graph: ReturnType<typeof buildGraph>,
	input: unknown,
	threadId: string,
	onEvent: ((event: RunEvent) => void) | undefined,
): Promise<StreamCollect> {
	const collect: StreamCollect = { results: [], interrupts: [] };
	const stream = await graph.stream(input as never, {
		streamMode: "updates",
		configurable: { thread_id: threadId },
	});
	for await (const chunk of stream) {
		if (!chunk || typeof chunk !== "object") continue;
		for (const [node, partial] of Object.entries(
			chunk as Record<string, unknown>,
		)) {
			if (node === "__interrupt__") {
				const arr = partial as Array<{ value: unknown }> | undefined;
				if (!arr) continue;
				for (const i of arr) {
					const v = i?.value as JudgmentInterrupt | undefined;
					if (!v || v.kind !== "host-judgment-required") continue;
					collect.interrupts.push(v);
					onEvent?.({ type: "interrupt", interrupt: v });
				}
				continue;
			}
			const part = partial as Partial<GraphStateType> | undefined;
			if (!part) continue;
			if (part.results) {
				for (const r of part.results) {
					collect.results.push(r);
					onEvent?.({ type: "result", result: r });
				}
			}
			if (part.manifest) collect.manifest = part.manifest;
			if (part.report) {
				collect.report = part.report;
				onEvent?.({ type: "report", report: part.report });
			}
		}
	}
	return collect;
}

async function buildPartialReport(
	collect: StreamCollect,
	cwd: string,
): Promise<CheckReport> {
	const manifest = collect.manifest ?? (await loadManifest(cwd));
	const synthesized: CheckResult[] = collect.interrupts.map((i) => ({
		...i.pendingResult,
		status: "needs-judgment",
		message: i.pendingResult.message ?? `awaiting judgment in ${i.requestPath}`,
	}));
	const results = [...collect.results, ...synthesized];
	const passed = results.filter((r) => r.status === "pass").length;
	const pendingJudgments = results.filter(
		(r) => r.status === "needs-judgment",
	).length;
	const report: CheckReport = {
		createdAt: new Date().toISOString(),
		totalEntries: results.length,
		passed,
		failed: results.length - passed - pendingJudgments,
		pendingJudgments,
		results,
	};
	if (manifest) {
		await writeJudgments({ report, manifest, cwd });
	}
	await writeSummaryMarkdown(report, cwd);
	await ensureGitignore(cwd);
	return report;
}

export async function runGraph(opts: RunOptions): Promise<CheckReport> {
	const cwd = opts.cwd ?? process.cwd();
	const concurrency = opts.concurrency ?? defaultConcurrency();
	const captureSemaphore = new Semaphore(concurrency);
	const diffSemaphore = new Semaphore(cpuParallelism());
	const baselinesDir = paths(cwd).baselines;
	const checkpointer = new FsCheckpointSaver(paths(cwd).checkpoints);
	const graph = buildGraph(captureSemaphore, diffSemaphore, checkpointer);
	const threadId = opts.threadId ?? threadIdFor(cwd);

	if (!opts.resume) {
		await checkpointer.deleteThread(threadId);
	}

	const input = opts.resume
		? new Command({ resume: opts.resume })
		: {
				options: {
					baseUrl: opts.baseUrl ?? "",
					cwd,
					threshold: opts.threshold,
					concurrency,
					emitDiffPng: opts.emitDiffPng ?? true,
					judge: opts.judge ?? "none",
					baselinesDir,
				},
			};

	let collect: StreamCollect;
	try {
		collect = await streamGraph(graph, input, threadId, opts.onEvent);
	} finally {
		await closeBrowser();
	}

	const report = collect.report ?? (await buildPartialReport(collect, cwd));

	if (opts.junitPath) {
		const target = path.isAbsolute(opts.junitPath)
			? opts.junitPath
			: path.join(cwd, opts.junitPath);
		await writeJunit(report, target);
	}

	if (collect.interrupts.length === 0) {
		await checkpointer.deleteThread(threadId).catch(() => undefined);
	}

	return report;
}

export interface ResumeOptions {
	cwd?: string;
	verdicts: ResumeMap;
	threadId?: string;
	onEvent?: (event: RunEvent) => void;
	junitPath?: string;
}

export async function resumeGraph(opts: ResumeOptions): Promise<CheckReport> {
	return runGraph({
		cwd: opts.cwd,
		threadId: opts.threadId,
		resume: opts.verdicts,
		onEvent: opts.onEvent,
		junitPath: opts.junitPath,
	});
}

export function runCheck(opts: CheckOptions): Promise<CheckReport> {
	return runGraph(opts);
}
