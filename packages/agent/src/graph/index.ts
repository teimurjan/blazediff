import { createHash } from "node:crypto";
import path from "node:path";
import { Command, END, Send, START, StateGraph } from "@langchain/langgraph";
import { closeBrowser } from "../browser/launch";
import { ensureGitignore } from "../cli/gitignore";
import { cpuCores, defaultConcurrency } from "../defaults";
import type { Verdict } from "../diff/verdict";
import { type JudgeBackend, resolveJudge, writeJudgments } from "../judge";
import { isDerived, loadManifest } from "../manifest";
import { paths } from "../paths";
import { writeReport } from "../report/json";
import { writeJunit } from "../report/junit";
import type { CheckReport, CheckResult, Manifest } from "../types";
import { FsCheckpointSaver } from "./checkpoint";
import { emitEvent, setEventSink } from "./events";
import type { JudgmentInterrupt } from "./interrupt";
import { makeCaptureNode } from "./nodes/capture";
import { makeDiffNode } from "./nodes/diff";
import { judgeNode } from "./nodes/judge";
import { loadNode } from "./nodes/load";
import { createSemaphore, type Semaphore } from "./semaphore";
import {
	BranchState,
	CaptureState,
	GraphState,
	type GraphStateType,
} from "./state";

export type ResumeMap = Record<string, Verdict>;

export type RunEvent =
	| { type: "capturing"; entryId: string; url: string }
	| { type: "captured"; entryId: string }
	| { type: "capture-complete"; captured: number; total: number }
	| { type: "diffing"; entryId: string; url: string }
	| { type: "result"; result: CheckResult }
	| { type: "judging"; entryId: string; url: string }
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

export function threadIdFor(cwd: string): string {
	return createHash("sha1")
		.update(paths(cwd).manifest)
		.digest("hex")
		.slice(0, 16);
}

function buildCaptureGraph(
	captureSemaphore: Semaphore,
	abortController: AbortController,
) {
	// Per-base-entry capture. Each Send runs the base entry's harnesses and
	// emits its base + sub-shots into the shared `captured` channel.
	return new StateGraph(CaptureState)
		.addNode("capture", makeCaptureNode(captureSemaphore, abortController))
		.addEdge(START, "capture")
		.addEdge("capture", END)
		.compile();
}

function buildBranchGraph(diffSemaphore: Semaphore) {
	// Per-screenshot diff + judge. Capture already ran; the Send payload carries
	// the captureOutput. Only `results` bubbles up via the append reducer. The
	// judge no longer needs an outer semaphore — each backend paces itself
	// (local pipelines vision/classifier internally, host is just file IO).
	return new StateGraph(BranchState)
		.addNode("diff", makeDiffNode(diffSemaphore))
		.addNode("judge", judgeNode)
		.addEdge(START, "diff")
		.addEdge("diff", "judge")
		.addEdge("judge", END)
		.compile();
}

// Join node: runs once after every capture branch completes (before any
// diff/judge branch fans out). It warms the judge so model weights stream in as
// their own visible phase, between capture and judging, rather than stalling the
// first test silently.
async function dispatchNode(
	state: GraphStateType,
): Promise<Partial<GraphStateType>> {
	const total = state.captured.length;
	const captured = state.captured.filter(
		(item) => item.output.captureOutputPath,
	).length;
	emitEvent({ type: "capture-complete", captured, total });
	if (state.options) await resolveJudge(state.options.judge).warmup?.();
	return {};
}

function buildGraph(
	captureSemaphore: Semaphore,
	diffSemaphore: Semaphore,
	checkpointer: FsCheckpointSaver,
	abortController: AbortController,
) {
	const captureBranch = buildCaptureGraph(captureSemaphore, abortController);
	const branch = buildBranchGraph(diffSemaphore);
	return new StateGraph(GraphState)
		.addNode("load", loadNode)
		.addNode("capture", captureBranch)
		.addNode("dispatch", dispatchNode)
		.addNode("branch", branch)
		.addEdge(START, "load")
		.addConditionalEdges(
			"load",
			(state: GraphStateType) =>
				state.entries
					.filter((entry) => !isDerived(entry))
					.map(
						(entry) =>
							new Send("capture", {
								entry,
								children: state.entries.filter((e) => e.parent === entry.id),
								options: state.options,
							}),
					),
			["capture"],
		)
		.addEdge("capture", "dispatch")
		.addConditionalEdges(
			"dispatch",
			(state: GraphStateType) =>
				state.captured.map(
					(c) =>
						new Send("branch", {
							entry: c.entry,
							captureOutput: c.output,
							options: state.options,
						}),
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
				// `result` is emitted out-of-band from the judge node so it lands
				// before the next semaphore acquirer's "judging" line — see
				// makeJudgeNode. Stream updates only feed the collected report here.
				for (const r of part.results) collect.results.push(r);
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
	await writeReport(report, cwd);
	await ensureGitignore(cwd);
	return report;
}

export async function runGraph(opts: RunOptions): Promise<CheckReport> {
	const cwd = opts.cwd ?? process.cwd();
	const concurrency = opts.concurrency ?? defaultConcurrency();
	const captureSemaphore = createSemaphore(concurrency);
	const diffSemaphore = createSemaphore(cpuCores());
	const abortController = new AbortController();
	const baselinesDir = paths(cwd).baselines;
	const checkpointer = new FsCheckpointSaver(paths(cwd).checkpoints);
	const graph = buildGraph(
		captureSemaphore,
		diffSemaphore,
		checkpointer,
		abortController,
	);
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
	setEventSink(opts.onEvent);
	try {
		collect = await streamGraph(graph, input, threadId, opts.onEvent);
	} finally {
		abortController.abort();
		setEventSink(undefined);
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
