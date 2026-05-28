import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Verdict } from "../../src/diff/verdict";
import {
	type ClassifierRunner,
	createClassifierRunnerHolder,
} from "../../src/judge/classifier";
import { createLocalJudge } from "../../src/judge/local";
import type { Judge, JudgeInput } from "../../src/judge/types";
import {
	createVisionRunnerHolder,
	type VisionRunner,
} from "../../src/judge/vision";
import type { ManifestEntry } from "../../src/types";

const heuristicVerdict: Verdict = {
	label: "ambiguous",
	headline: "heuristic could not decide",
	rationale: ["pixel diff in one region"],
	action: "investigate",
};

const entry: ManifestEntry = {
	id: "home",
	url: "/",
	viewport: { width: 1280, height: 800 },
	waitFor: ["networkidle"],
	mask: [],
	baselinePath: ".blazediff/baselines/home.png",
	captureHash: "sha256:test",
	createdBy: "agent",
	createdAt: "2026-05-26",
};

// No regions/diffPath → judge feeds the full actual screenshot (path is never
// read because both runners are mocked).
const input: JudgeInput = {
	entry,
	baselinePath: "/tmp/base.png",
	actualPath: "/tmp/actual.png",
	heuristicVerdict,
};

let cwd: string;

beforeEach(async () => {
	cwd = await mkdtemp(path.join(tmpdir(), "bd-local-"));
});

afterEach(async () => {
	await rm(cwd, { recursive: true, force: true });
});

/** Build a judge whose vision returns `description` and classifier `answer`. */
function judgeWith(description: string, answer: string): Judge {
	return createLocalJudge({
		vision: createVisionRunnerHolder(async () => ({
			describe: async () => description,
		})),
		classifier: createClassifierRunnerHolder(async () => ({
			complete: async () => answer,
		})),
	});
}

/** Build a judge with custom factories (when you need to count loads, capture prompts, …). */
function judgeWithRunners(
	visionFactory: () => Promise<VisionRunner>,
	classifierFactory: () => Promise<ClassifierRunner>,
): Judge {
	return createLocalJudge({
		vision: createVisionRunnerHolder(visionFactory),
		classifier: createClassifierRunnerHolder(classifierFactory),
	});
}

describe("localJudge", () => {
	it("classifies a regression answer from step 2", async () => {
		const out = await judgeWith(
			"The submit button is gone.",
			"regression-likely\nThe submit button is missing.",
		).judge(input, cwd);
		expect(out.kind).toBe("judged");
		if (out.kind !== "judged") throw new Error("expected judged");
		expect(out.verdict.label).toBe("regression-likely");
		expect(out.verdict.action).toBe("investigate");
		expect(out.confidence).toBe(0.6);
		// Headline is the reason, not the bare label.
		expect(out.verdict.headline).not.toMatch(/regression-likely/i);
	});

	it("classifies an intentional answer", async () => {
		const out = await judgeWith(
			"The heading text reads differently.",
			"intentional-likely - the heading copy was deliberately updated.",
		).judge(input, cwd);
		if (out.kind !== "judged") throw new Error("expected judged");
		expect(out.verdict.label).toBe("intentional-likely");
		expect(out.verdict.action).toBe("rewrite-if-intended");
	});

	it("classifies a noise answer", async () => {
		const out = await judgeWith(
			"Edges look very slightly different.",
			"noise-likely: only negligible anti-aliasing differences.",
		).judge(input, cwd);
		if (out.kind !== "judged") throw new Error("expected judged");
		expect(out.verdict.label).toBe("noise-likely");
		expect(out.verdict.action).toBe("ignore-or-rewrite");
	});

	it("takes the label from the trailing VERDICT line, not earlier mentions", async () => {
		// Reasoning name-drops "regression-likely" but commits to intentional;
		// the committed label must win (the old parser picked the first mention).
		const out = await judgeWith(
			"The heading copy differs.",
			"This is not regression-likely; the copy was deliberately updated.\nVERDICT: intentional-likely",
		).judge(input, cwd);
		if (out.kind !== "judged") throw new Error("expected judged");
		expect(out.verdict.label).toBe("intentional-likely");
		// Headline is the reasoning, sourced from before the VERDICT line.
		expect(out.verdict.headline).toContain("deliberately updated");
		expect(out.verdict.headline).not.toMatch(/verdict:/i);
	});

	it("passes the step-1 description into the classifier prompt", async () => {
		let seenPrompt = "";
		const judge = judgeWithRunners(
			async () => ({ describe: async () => "the footer moved up by 40px" }),
			async () => ({
				complete: async (prompt: string) => {
					seenPrompt = prompt;
					return "ambiguous - not sure.";
				},
			}),
		);
		await judge.judge(input, cwd);
		expect(seenPrompt).toContain("the footer moved up by 40px");
	});

	it("reads each region side and feeds the deterministic delta to the classifier", async () => {
		// Real crops are produced by prepareRegionReads, so write actual PNGs.
		const baselinePath = path.join(cwd, "base.png");
		const actualPath = path.join(cwd, "actual.png");
		await sharp({
			create: { width: 400, height: 80, channels: 3, background: "#fff" },
		})
			.png()
			.toFile(baselinePath);
		await sharp({
			create: { width: 400, height: 80, channels: 3, background: "#fff" },
		})
			.png()
			.toFile(actualPath);

		let seenPrompt = "";
		const judge = judgeWithRunners(
			// The vision runner reads each crop; key off the file suffix the crop
			// step writes (read-N.before.png / read-N.after.png).
			async () => ({
				describe: async (imagePath: string) =>
					imagePath.includes(".after.")
						? 'the logo reads "Nimbus 123"'
						: 'the logo reads "Nimbus"',
			}),
			async () => ({
				complete: async (prompt: string) => {
					seenPrompt = prompt;
					return "deliberate copy update.\nVERDICT: intentional-likely";
				},
			}),
		);

		const regionInput: JudgeInput = {
			entry,
			baselinePath,
			actualPath,
			regions: [
				{
					bbox: { x: 254, y: 24, width: 29, height: 15 },
					pixelCount: 214,
					percentage: 0.02,
					changeType: "addition",
					confidence: 1,
				},
			],
			diffPercentage: 0.01,
			severity: "low",
			heuristicVerdict,
		};

		const out = await judge.judge(regionInput, cwd);
		if (out.kind !== "judged") throw new Error("expected judged");
		// The classifier sees the precise delta, not a raw model description.
		expect(seenPrompt).toContain('added "123"');
		expect(seenPrompt).toContain("Nimbus 123");
		expect(out.verdict.label).toBe("intentional-likely");
	});

	it("falls back to the heuristic verdict when the classifier is non-committal", async () => {
		const out = await judgeWith(
			"Something changed.",
			"I am not sure what changed here.",
		).judge(input, cwd);
		if (out.kind !== "judged") throw new Error("expected judged");
		expect(out.verdict).toEqual(heuristicVerdict);
	});

	it("emits kind:failed with the heuristic fallback when a step throws", async () => {
		const judge = judgeWithRunners(
			async () => {
				throw new Error("model load failed");
			},
			async () => ({ complete: async () => "" }),
		);
		const out = await judge.judge(input, cwd);
		if (out.kind !== "failed") throw new Error("expected failed");
		expect(out.reason).toBe("model-load");
		expect(out.error.message).toBe("model load failed");
		expect(out.fallback).toEqual(heuristicVerdict);
	});

	it("reuses the same runner instances across judgments", async () => {
		let visionLoads = 0;
		let classifierLoads = 0;
		const judge = judgeWithRunners(
			async () => {
				visionLoads += 1;
				return { describe: async () => "changed" };
			},
			async () => {
				classifierLoads += 1;
				return { complete: async () => "noise-likely: negligible." };
			},
		);
		await judge.judge(input, cwd);
		await judge.judge(input, cwd);
		expect(visionLoads).toBe(1);
		expect(classifierLoads).toBe(1);
	});
});
