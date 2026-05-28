import type { Command } from "commander";
import { loadConfig, resolveBaseUrl } from "../../config";
import { DEFAULT_THRESHOLD } from "../../defaults";
import { type RunEvent, runGraph } from "../../graph";
import { type ApplyJudgmentsResult, applyJudgments } from "../../judge";
import { paths } from "../../paths";
import type { CheckReport } from "../../types";
import { parseJudge, slimReport } from "../check-output";
import type { Output } from "../output";
import { parsePositiveInteger, parseThreshold } from "../parsers";
import { failureBlock, summaryLine } from "../render/check";
import { createProgress } from "../render/progress";
import { relPath } from "../render/theme";

interface Opts {
	baseUrl?: string;
	threshold: string;
	concurrency?: string;
	diffPng: boolean;
	junit?: string;
	judge?: string;
	applyJudgments?: boolean;
}

function makeProgressReporter(out: Output) {
	if (out.isJson() || out.isQuiet()) return undefined;
	const view = createProgress();
	return (event: RunEvent) => view.emit(event);
}

/** Compose the human-readable output for `--apply-judgments`. */
function buildApplyHuman(r: ApplyJudgmentsResult, reportPath: string): string {
	if (
		r.applied.length === 0 &&
		r.missing.length === 0 &&
		r.invalid.length === 0
	) {
		return `no judgments to apply\n  report: ${relPath(reportPath)}`;
	}
	return [
		`applied ${r.applied.length} judgment(s)`,
		r.missing.length
			? `  ${r.missing.length} pending without judgment: ${r.missing.join(", ")}`
			: undefined,
		r.invalid.length
			? `  ${r.invalid.length} invalid judgment file(s): ${r.invalid.join(", ")}`
			: undefined,
		`  ${r.report.passed}/${r.report.totalEntries} passed (${r.report.failed} failed, ${r.report.pendingJudgments} pending)`,
		`  report: ${relPath(reportPath)}`,
	]
		.filter(Boolean)
		.join("\n");
}

/**
 * Compose the human-readable output for a normal `check` run. Layout is flat
 * (no nested indents): summary headline, one line per verdict-group failure,
 * then the report path and footer hints — matching the structure the failure
 * summary actually needs.
 */
function buildCheckHuman(
	report: CheckReport,
	reportPath: string,
	judgmentsPath: string,
): string {
	const summary = summaryLine(report);
	if (report.failed === 0 && report.pendingJudgments === 0) {
		return `${summary}\nreport: ${relPath(reportPath)}`;
	}
	const reviewHint =
		report.failed > 0 || report.pendingJudgments > 0
			? "run `blazediff-agent review` to review interactively"
			: undefined;
	return [
		summary,
		...failureBlock(report.results),
		`report: ${relPath(reportPath)}`,
		report.pendingJudgments > 0
			? `pending: ${relPath(judgmentsPath)}/ - host writes <id>/verdict.json, then re-run check --apply-judgments`
			: undefined,
		reviewHint,
	]
		.filter(Boolean)
		.join("\n");
}

/** 1 when the run has hard failures; undefined keeps the inherited success exit. */
function exitCodeFor(report: CheckReport): number | undefined {
	return report.failed > 0 ? 1 : undefined;
}

export function registerCheck(program: Command, out: Output): void {
	program
		.command("check")
		.description("run the visual regression check (CI verb)")
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
			"judge backend for ambiguous diffs (host | none | local). default: config.judge, else none",
		)
		.option(
			"--apply-judgments",
			"resume the suspended graph using .blazediff/judgments/<id>/verdict.json files",
		)
		.action(async (opts: Opts) => {
			const reportPath = paths().report;
			if (opts.applyJudgments) {
				const result = await applyJudgments({
					onEvent: makeProgressReporter(out),
					junitPath: opts.junit,
				});
				out.emit(
					{
						ok: true,
						applied: result.applied,
						missing: result.missing,
						invalid: result.invalid,
						...slimReport(result.report, reportPath),
					},
					buildApplyHuman(result, reportPath),
				);
				const code = exitCodeFor(result.report);
				if (code !== undefined) process.exitCode = code;
				return;
			}

			const config = await loadConfig();
			const baseUrl = resolveBaseUrl(config, opts.baseUrl);
			const report = await runGraph({
				baseUrl,
				threshold: parseThreshold(opts.threshold),
				concurrency: opts.concurrency
					? parsePositiveInteger(opts.concurrency, "--concurrency")
					: undefined,
				emitDiffPng: opts.diffPng,
				junitPath: opts.junit,
				judge: parseJudge(opts.judge ?? config?.judge ?? "none"),
				onEvent: makeProgressReporter(out),
			});

			out.emit(
				slimReport(report, reportPath),
				buildCheckHuman(report, reportPath, paths().judgments),
			);
			const code = exitCodeFor(report);
			if (code !== undefined) process.exitCode = code;
		});
}
