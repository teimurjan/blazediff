import { describe, expect, it } from "vitest";
import {
	failureBlock,
	progressLine,
	summaryLine,
} from "../../src/cli/render/check";
import type { CheckReport, CheckResult } from "../../src/types";

// picocolors auto-disables when stdout is not a TTY (as under vitest), so these
// assertions run against plain text — exactly what pipes and CI logs see.

function failResult(
	id: string,
	headline = '"123" added to Nimbus text',
): CheckResult {
	return {
		id,
		url: `/${id}`,
		status: "fail",
		diffPercentage: 0.01,
		verdict: {
			label: "intentional-likely",
			headline,
			rationale: [],
			action: "rewrite-if-intended",
		},
		diffPath: `${process.cwd()}/.blazediff/actual/${id}.diff.png`,
	};
}

describe("failureBlock", () => {
	it("collapses entries that share a verdict into a single headline (no ids when only one group)", () => {
		const results = ["docs", "home", "pricing"].map((id) => failResult(id));
		const lines = failureBlock(results);
		// One headline, one line — no glyph + id list, no action arrow, no diffs.
		expect(lines).toHaveLength(1);
		expect(lines[0]).toBe('"123" added to Nimbus text');
	});

	it("prefixes each headline with its ids when there are multiple verdict groups", () => {
		const results = [
			failResult("docs", "headline A"),
			failResult("home", "headline A"),
			failResult("pricing", "headline B"),
		];
		const lines = failureBlock(results);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("docs, home:");
		expect(lines[0]).toContain("headline A");
		expect(lines[1]).toContain("pricing:");
		expect(lines[1]).toContain("headline B");
	});

	it("omits per-test diff paths and the action arrow entirely", () => {
		const lines = failureBlock([failResult("docs")]).join("\n");
		expect(lines).not.toContain(".diff.png");
		expect(lines).not.toContain("→");
		expect(lines).not.toContain("rewrite-if-intended");
	});

	it("keeps verdict-less results distinct with id + status", () => {
		const results: CheckResult[] = [
			{
				id: "a",
				url: "/a",
				status: "missing-baseline",
				message: "no baseline",
			},
			{ id: "b", url: "/b", status: "fail", diffPercentage: 1.2 },
		];
		const lines = failureBlock(results);
		expect(lines.some((l) => l.includes("a: missing-baseline"))).toBe(true);
		expect(lines.some((l) => l.includes("b: fail (1.200%)"))).toBe(true);
	});
});

describe("progressLine", () => {
	it("returns undefined for captured so each page renders once (judging → result)", () => {
		expect(progressLine({ type: "captured", entryId: "home" })).toBeUndefined();
	});

	it("shows an in-flight line when a test starts judging", () => {
		const line = progressLine({
			type: "judging",
			entryId: "home",
			url: "/home",
		});
		expect(line).toContain("home");
		expect(line).toContain("judging");
	});

	it("renders a completed result with its status and no leading counter", () => {
		const line = progressLine({ type: "result", result: failResult("home") });
		expect(line).toContain("home");
		expect(line).not.toContain("judging");
		// Counter `[N]` / `[N/total]` is gone — only the glyph leads the line.
		expect(line).not.toMatch(/^\s*\[\d/);
		expect(line).not.toMatch(/\[\d+\/\d+\]/);
	});
});

describe("summaryLine", () => {
	it("reports failures and pending judgments", () => {
		const report: CheckReport = {
			createdAt: "",
			totalEntries: 5,
			passed: 0,
			failed: 4,
			pendingJudgments: 1,
			results: [],
		};
		expect(summaryLine(report)).toBe(
			"0/5 passed (4 failed, 1 pending judgment)",
		);
	});

	it("omits the parenthetical when everything passes", () => {
		const report: CheckReport = {
			createdAt: "",
			totalEntries: 3,
			passed: 3,
			failed: 0,
			pendingJudgments: 0,
			results: [],
		};
		expect(summaryLine(report)).toBe("3/3 passed");
	});
});
