import type { JudgeBackend } from "../judge";
import type { CheckReport, CheckResult } from "../types";

export function slimResult(r: CheckResult) {
	return {
		id: r.id,
		url: r.url,
		status: r.status,
		verdict: r.verdict
			? {
					label: r.verdict.label,
					headline: r.verdict.headline,
					action: r.verdict.action,
				}
			: undefined,
	};
}

export function slimReport(report: CheckReport, reportPath: string) {
	return {
		reportPath,
		createdAt: report.createdAt,
		totalEntries: report.totalEntries,
		passed: report.passed,
		failed: report.failed,
		pendingJudgments: report.pendingJudgments,
		results: report.results.filter((r) => r.status !== "pass").map(slimResult),
	};
}

export function parseJudge(input: string): JudgeBackend {
	// Accept the pre-rename "moondream" name so existing configs keep working.
	const aliased = input === "moondream" ? "local" : input;
	if (aliased === "host" || aliased === "none" || aliased === "local")
		return aliased;
	throw new Error(
		`unknown --judge backend: ${input} (expected: host | none | local)`,
	);
}
