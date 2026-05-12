import { Annotation, END, Send, START, StateGraph } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

// Same fan-out shape as the agent: load → 3 parallel entries → each runs
// capture → diff → judge → emits one result. Built as a subgraph so each
// branch carries its own per-step state, only `results` merges into the
// parent via the append reducer.

const BranchState = Annotation.Root({
	entry: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	captured: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	diffed: Annotation<string | undefined>({
		reducer: (_, next) => next,
		default: () => undefined,
	}),
	results: Annotation<string[]>({
		reducer: (acc, next) => [...acc, ...next],
		default: () => [],
	}),
});

const MainState = Annotation.Root({
	ids: Annotation<string[]>({
		reducer: (acc, next) => next ?? acc,
		default: () => [],
	}),
	results: Annotation<string[]>({
		reducer: (acc, next) => [...acc, ...next],
		default: () => [],
	}),
});

describe("Per-entry subgraph fan-out", () => {
	it("each branch runs capture → diff → judge as its own isolated task", async () => {
		const captureCalls: string[] = [];
		const diffCalls: string[] = [];
		const judgeCalls: string[] = [];

		const branch = new StateGraph(BranchState)
			.addNode("capture", async (s) => {
				captureCalls.push(s.entry!);
				return { captured: `cap-${s.entry}` };
			})
			.addNode("diff", async (s) => {
				diffCalls.push(`${s.entry}|${s.captured}`);
				return { diffed: `diff-${s.entry}-from-${s.captured}` };
			})
			.addNode("judge", async (s) => {
				judgeCalls.push(`${s.entry}|${s.diffed}`);
				return { results: [`${s.entry}:${s.diffed}`] };
			})
			.addEdge(START, "capture")
			.addEdge("capture", "diff")
			.addEdge("diff", "judge")
			.addEdge("judge", END)
			.compile();

		const main = new StateGraph(MainState)
			.addNode("branch", branch)
			.addConditionalEdges(
				START,
				(s) => s.ids.map((id) => new Send("branch", { entry: id })),
				["branch"],
			)
			.addEdge("branch", END)
			.compile();

		const final = await main.invoke({ ids: ["a", "b", "c"] });

		expect(captureCalls.sort()).toEqual(["a", "b", "c"]);
		expect(diffCalls.sort()).toEqual(["a|cap-a", "b|cap-b", "c|cap-c"]);
		expect(judgeCalls.sort()).toEqual([
			"a|diff-a-from-cap-a",
			"b|diff-b-from-cap-b",
			"c|diff-c-from-cap-c",
		]);
		expect(final.results.sort()).toEqual([
			"a:diff-a-from-cap-a",
			"b:diff-b-from-cap-b",
			"c:diff-c-from-cap-c",
		]);
	});
});
