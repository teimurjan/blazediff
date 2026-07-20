import { describe, expect, it } from "vitest";
import {
	checkSummary,
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

describe("progressLine", () => {
	it("renders capture and comparison phases before judgment", () => {
		expect(
			progressLine({ type: "capturing", entryId: "home", url: "/home" }),
		).toContain("capturing");
		expect(progressLine({ type: "captured", entryId: "home" })).toContain(
			"captured",
		);
		expect(
			progressLine({ type: "capture-complete", captured: 1, total: 1 }),
		).toContain("capture complete");
		expect(
			progressLine({ type: "diffing", entryId: "home", url: "/home" }),
		).toContain("comparing");
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
		expect(line).toContain('"123" added to Nimbus text');
		// Counter `[N]` / `[N/total]` is gone — only the glyph leads the line.
		expect(line).not.toMatch(/^\s*\[\d/);
		expect(line).not.toMatch(/\[\d+\/\d+\]/);
	});
	it("keeps the verdict detail in an awaiting-judgment row", () => {
		const pending = {
			...failResult("home", "navigation shifted"),
			status: "needs-judgment" as const,
		};
		const line = progressLine({
			type: "interrupt",
			interrupt: {
				kind: "host-judgment-required",
				entryId: "home",
				url: "/home",
				requestPath: "/tmp/home/request.json",
				pendingResult: pending,
			},
		});
		expect(line).toContain("navigation shifted");
		expect(line).toContain("awaiting judgment");
	});
});

describe("checkSummary", () => {
	it("does not repeat details already shown in live rows", () => {
		const report: CheckReport = {
			createdAt: "",
			totalEntries: 1,
			passed: 0,
			failed: 0,
			pendingJudgments: 1,
			results: [
				{
					...failResult("home", "navigation shifted"),
					status: "needs-judgment",
				},
			],
		};
		const output = checkSummary(
			report,
			"/repo/.blazediff/report.json",
			"/repo/.blazediff/judgments",
		);
		expect(output).toContain("0/1 passed (1 pending judgment)");
		expect(output).toContain("report:");
		expect(output).toContain("pending:");
		expect(output).not.toContain("navigation shifted");
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
