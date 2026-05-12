import path from "node:path";
import { END, Send, START, StateGraph } from "@langchain/langgraph";
import { closeBrowser } from "../browser/launch";
import { defaultConcurrency } from "../defaults";
import type { JudgeBackend } from "../judge";
import { paths } from "../paths";
import { writeJunit } from "../report/junit";
import type { CheckReport } from "../types";
import { aggregateNode } from "./nodes/aggregate";
import { loadNode } from "./nodes/load";
import { makeProcessNode } from "./nodes/process";
import { Semaphore } from "./semaphore";
import { GraphState, type GraphStateType } from "./state";

export interface RunOptions {
	baseUrl: string;
	cwd?: string;
	threshold?: number;
	concurrency?: number;
	emitDiffPng?: boolean;
	junitPath?: string;
	judge?: JudgeBackend;
}

function buildGraph(semaphore: Semaphore) {
	return new StateGraph(GraphState)
		.addNode("load", loadNode)
		.addNode("process", makeProcessNode(semaphore))
		.addNode("aggregate", aggregateNode)
		.addEdge(START, "load")
		.addConditionalEdges(
			"load",
			(state: GraphStateType) =>
				state.entries.map(
					(entry) => new Send("process", { entry, options: state.options }),
				),
			["process"],
		)
		.addEdge("process", "aggregate")
		.addEdge("aggregate", END)
		.compile();
}

export async function runGraph(opts: RunOptions): Promise<CheckReport> {
	const cwd = opts.cwd ?? process.cwd();
	const concurrency = opts.concurrency ?? defaultConcurrency();
	const semaphore = new Semaphore(concurrency);
	const baselinesDir = paths(cwd).baselines;

	const graph = buildGraph(semaphore);

	let finalState: GraphStateType;
	try {
		finalState = await graph.invoke({
			options: {
				baseUrl: opts.baseUrl,
				cwd,
				threshold: opts.threshold,
				concurrency,
				emitDiffPng: opts.emitDiffPng ?? true,
				judge: opts.judge ?? "none",
				baselinesDir,
			},
		});
	} finally {
		await closeBrowser();
	}

	const report = finalState.report;
	if (!report) {
		throw new Error("runGraph: graph completed without producing a report");
	}
	if (opts.junitPath) {
		const target = path.isAbsolute(opts.junitPath)
			? opts.junitPath
			: path.join(cwd, opts.junitPath);
		await writeJunit(report, target);
	}
	return report;
}
