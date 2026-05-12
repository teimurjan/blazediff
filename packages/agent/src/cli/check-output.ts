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

export function slimReport(report: CheckReport, summaryPath: string) {
	return {
		summaryPath,
		createdAt: report.createdAt,
		totalEntries: report.totalEntries,
		passed: report.passed,
		failed: report.failed,
		pendingJudgments: report.pendingJudgments,
		results: report.results.filter((r) => r.status !== "pass").map(slimResult),
	};
}

export function failureLines(results: CheckResult[]): string[] {
	return results
		.filter((r) => r.status !== "pass")
		.flatMap((r) => {
			const lines: string[] = [];
			const prefix = r.status === "needs-judgment" ? "?" : "✗";
			if (r.verdict) {
				lines.push(
					`  ${prefix} ${r.id}  [${r.verdict.label}]  ${r.verdict.headline}`,
				);
				lines.push(`      → ${r.verdict.action}`);
			} else {
				const detail =
					typeof r.diffPercentage === "number"
						? `${r.status} (${r.diffPercentage.toFixed(3)}%)`
						: r.status;
				lines.push(`  ${prefix} ${r.id}: ${detail}`);
			}
			if (r.status === "needs-judgment" && r.message) {
				lines.push(`      ${r.message}`);
			}
			if (r.diffPath) lines.push(`      diff: ${r.diffPath}`);
			return lines;
		});
}

export function parseJudge(input: string): JudgeBackend {
	if (input === "host" || input === "none") return input;
	throw new Error(`unknown --judge backend: ${input} (expected: host | none)`);
}
