import type { Command } from "commander";
import { loadConfig, resolveBaseUrl } from "../../config";
import { DEFAULT_THRESHOLD } from "../../defaults";
import { runGraph } from "../../graph";
import type { JudgeBackend } from "../../judge";
import { paths } from "../../paths";
import type { CheckReport, CheckResult } from "../../types";
import type { Output } from "../output";

function slimResult(r: CheckResult) {
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

function slimReport(report: CheckReport, summaryPath: string) {
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

interface Opts {
	baseUrl?: string;
	threshold: string;
	concurrency?: string;
	diffPng: boolean;
	junit?: string;
	judge: string;
	mode: string;
}

function failureLines(results: CheckResult[]): string[] {
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

function parseJudge(input: string): JudgeBackend {
	if (input === "host" || input === "none") return input;
	throw new Error(`unknown --judge backend: ${input} (expected: host | none)`);
}

function parseMode(input: string): "actual" {
	if (input === "actual") return input;
	if (input === "baseline") {
		throw new Error(
			"`run --mode baseline` is not yet implemented. Use `init` + `capture` for authoring.",
		);
	}
	throw new Error(`unknown --mode: ${input} (expected: actual)`);
}

export function registerRun(program: Command, out: Output): void {
	program
		.command("run")
		.description(
			"streaming check pipeline via LangGraph (alternative to `check`)",
		)
		.option("--mode <mode>", "pipeline mode (actual)", "actual")
		.option("--base-url <url>", "override base URL")
		.option(
			"--threshold <n>",
			"color threshold (0-1)",
			String(DEFAULT_THRESHOLD),
		)
		.option(
			"--concurrency <n>",
			"max entries captured in parallel (default: auto based on CPU cores, capped at 8)",
		)
		.option("--no-diff-png", "skip writing diff PNGs")
		.option("--junit <path>", "write JUnit XML to this path (default: skipped)")
		.option(
			"--judge <backend>",
			"judge backend for ambiguous diffs (host | none)",
			"none",
		)
		.action(async (opts: Opts) => {
			parseMode(opts.mode);
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const report = await runGraph({
				baseUrl,
				threshold: Number(opts.threshold),
				concurrency: opts.concurrency ? Number(opts.concurrency) : undefined,
				emitDiffPng: opts.diffPng,
				junitPath: opts.junit,
				judge: parseJudge(opts.judge),
			});

			const summaryPath = paths().summary;
			const summary =
				report.pendingJudgments > 0
					? `${report.passed}/${report.totalEntries} passed (${report.failed} failed, ${report.pendingJudgments} pending judgment)`
					: report.failed === 0
						? `${report.passed}/${report.totalEntries} passed`
						: `${report.passed}/${report.totalEntries} passed (${report.failed} failed)`;

			const human =
				report.failed === 0 && report.pendingJudgments === 0
					? `${summary}\n  summary: ${summaryPath}`
					: [
							`${summary}:`,
							...failureLines(report.results),
							`  summary: ${summaryPath}`,
							report.pendingJudgments > 0
								? `  pending: ${paths().judgments}/ - host writes <id>/verdict.json, then re-run check --apply-judgments`
								: undefined,
						]
							.filter(Boolean)
							.join("\n");

			out.emit(slimReport(report, summaryPath), human);
			if (report.failed > 0) process.exitCode = 1;
		});
}
