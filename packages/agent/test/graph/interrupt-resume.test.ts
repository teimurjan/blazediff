import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	Annotation,
	Command,
	END,
	Send,
	START,
	StateGraph,
} from "@langchain/langgraph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsCheckpointSaver } from "../../src/graph/checkpoint";
import { interruptForJudgment } from "../../src/graph/interrupt";

let dir: string;

const State = Annotation.Root({
	ids: Annotation<string[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	}),
	entryId: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	results: Annotation<string[]>({
		reducer: (acc, next) => [...acc, ...next],
		default: () => [],
	}),
});

type S = typeof State.State;

interface BuildOpts {
	captureCounts: Map<string, number>;
}

function buildGraph(saver: FsCheckpointSaver, opts: BuildOpts) {
	return new StateGraph(State)
		.addNode("seed", async (_s: S) => ({}))
		.addNode("work", async (s: S) => {
			const id = s.entryId as string;
			opts.captureCounts.set(id, (opts.captureCounts.get(id) ?? 0) + 1);
			const verdict = interruptForJudgment({
				kind: "host-judgment-required",
				entryId: id,
				url: `https://example.com/${id}`,
				requestPath: `judgments/${id}`,
				signature: `sig-${id}`,
				pendingResult: {
					id,
					url: `https://example.com/${id}`,
					status: "fail",
					message: "ambiguous",
				},
			});
			if (!verdict) {
				return { results: [`${id}:pending`] };
			}
			return { results: [`${id}:${verdict.label}`] };
		})
		.addEdge(START, "seed")
		.addConditionalEdges(
			"seed",
			(s: S) => s.ids.map((id) => new Send("work", { entryId: id })),
			["work"],
		)
		.addEdge("work", END)
		.compile({ checkpointer: saver });
}

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "blazediff-resume-"));
});

afterEach(async () => {
	if (dir) await rm(dir, { recursive: true, force: true });
});

describe("interrupt + resume via FsCheckpointSaver", () => {
	it("interrupts on first run and resumes with provided verdicts", async () => {
		const saver = new FsCheckpointSaver(dir);
		const captureCounts = new Map<string, number>();
		const graph = buildGraph(saver, { captureCounts });
		const cfg = { configurable: { thread_id: "demo" } };

		const collectedInterrupts: string[] = [];
		const stream1 = await graph.stream(
			{ ids: ["a", "b"] },
			{
				...cfg,
				streamMode: "updates",
			},
		);
		for await (const chunk of stream1) {
			for (const [node, value] of Object.entries(
				chunk as Record<string, unknown>,
			)) {
				if (node === "__interrupt__") {
					const arr = value as Array<{ value: { entryId: string } }>;
					for (const i of arr) collectedInterrupts.push(i.value.entryId);
				}
			}
		}
		expect(collectedInterrupts.sort()).toEqual(["a", "b"]);
		expect(captureCounts.get("a")).toBe(1);
		expect(captureCounts.get("b")).toBe(1);

		// Fresh graph + saver pointing at same dir = "cross-process" simulation
		const saver2 = new FsCheckpointSaver(dir);
		const graph2 = buildGraph(saver2, { captureCounts });
		const stream2 = await graph2.stream(
			new Command({
				resume: {
					a: {
						label: "regression-likely",
						headline: "h-a",
						rationale: [],
						action: "investigate",
					},
					b: {
						label: "intentional-likely",
						headline: "h-b",
						rationale: [],
						action: "rewrite-if-intended",
					},
				},
			}),
			{ ...cfg, streamMode: "updates" },
		);
		const results: string[] = [];
		for await (const chunk of stream2) {
			for (const [node, value] of Object.entries(
				chunk as Record<string, unknown>,
			)) {
				if (node === "__interrupt__") continue;
				const p = value as { results?: string[] } | undefined;
				if (p?.results) results.push(...p.results);
			}
		}
		expect(results.sort()).toEqual([
			"a:regression-likely",
			"b:intentional-likely",
		]);
		// Each branch's `work` node should have re-run once on resume — still 2 total per id
		expect(captureCounts.get("a")).toBe(2);
		expect(captureCounts.get("b")).toBe(2);
	});

	it("resumes branches with verdicts and falls through to pending for missing ids", async () => {
		const saver = new FsCheckpointSaver(dir);
		const captureCounts = new Map<string, number>();
		const graph = buildGraph(saver, { captureCounts });
		const cfg = { configurable: { thread_id: "partial" } };

		const stream1 = await graph.stream(
			{ ids: ["a", "b"] },
			{
				...cfg,
				streamMode: "updates",
			},
		);
		for await (const _ of stream1) {
			/* drain */
		}

		const stream2 = await graph.stream(
			new Command({
				resume: {
					a: {
						label: "regression-likely",
						headline: "h-a",
						rationale: [],
						action: "investigate",
					},
				},
			}),
			{ ...cfg, streamMode: "updates" },
		);
		const interrupts: string[] = [];
		const results: string[] = [];
		for await (const chunk of stream2) {
			for (const [node, value] of Object.entries(
				chunk as Record<string, unknown>,
			)) {
				if (node === "__interrupt__") {
					const arr = value as Array<{ value: { entryId: string } }>;
					for (const i of arr) interrupts.push(i.value.entryId);
					continue;
				}
				const p = value as { results?: string[] } | undefined;
				if (p?.results) results.push(...p.results);
			}
		}
		expect(results.sort()).toEqual(["a:regression-likely", "b:pending"]);
		expect(interrupts).toEqual([]);
	});
});
