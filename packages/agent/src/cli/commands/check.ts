import type { Command } from "commander";
import {
	formatMissingEnv,
	personasFromManifest,
	validatePersonas,
} from "../../auth/env";
import { loadConfig, resolveBaseUrl } from "../../config";
import { DEFAULT_THRESHOLD } from "../../defaults";
import { type RunEvent, runGraph } from "../../graph";
import { applyJudgments } from "../../judge";
import { loadManifest } from "../../manifest";
import { paths } from "../../paths";
import { failureLines, parseJudge, slimReport } from "../check-output";
import type { Output } from "../output";
import { parsePositiveInteger, parseThreshold } from "../parsers";

interface Opts {
	baseUrl?: string;
	threshold: string;
	concurrency?: string;
	diffPng: boolean;
	junit?: string;
	judge: string;
	applyJudgments?: boolean;
}

function glyphFor(status: string): string {
	switch (status) {
		case "pass":
			return "✓";
		case "needs-judgment":
			return "?";
		case "stale-baseline":
		case "missing-baseline":
			return "!";
		default:
			return "✗";
	}
}

function makeProgressReporter(out: Output) {
	if (out.isJson() || out.isQuiet()) return undefined;
	let done = 0;
	let total = 0;
	const counter = () => (total > 0 ? `[${done}/${total}]` : `[${done}]`);
	return (event: RunEvent) => {
		if (event.type === "report") {
			total = event.report.totalEntries;
			return;
		}
		if (event.type === "result") {
			done += 1;
			const r = event.result;
			const detail =
				r.status === "fail" && typeof r.diffPercentage === "number"
					? `  (${r.diffPercentage.toFixed(3)}%)`
					: r.status !== "pass" && r.message
						? `  (${r.message})`
						: "";
			process.stderr.write(
				`${counter()} ${glyphFor(r.status)} ${r.id}${detail}\n`,
			);
			return;
		}
		if (event.type === "interrupt") {
			done += 1;
			process.stderr.write(
				`${counter()} ? ${event.interrupt.entryId}  (awaiting judgment)\n`,
			);
		}
	};
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
			"judge backend for ambiguous diffs (host | none)",
			"none",
		)
		.option(
			"--apply-judgments",
			"resume the suspended graph using .blazediff/judgments/<id>/verdict.json files",
		)
		.action(async (opts: Opts) => {
			if (opts.applyJudgments) {
				const { report, applied, missing, invalid } = await applyJudgments({
					onEvent: makeProgressReporter(out),
					junitPath: opts.junit,
				});
				const summaryPath = paths().summary;
				const human =
					applied.length === 0 && missing.length === 0 && invalid.length === 0
						? `no judgments to apply\n  summary: ${summaryPath}`
						: [
								`applied ${applied.length} judgment(s)`,
								missing.length
									? `  ${missing.length} pending without judgment: ${missing.join(", ")}`
									: undefined,
								invalid.length
									? `  ${invalid.length} invalid judgment file(s): ${invalid.join(", ")}`
									: undefined,
								`  ${report.passed}/${report.totalEntries} passed (${report.failed} failed, ${report.pendingJudgments} pending)`,
								`  summary: ${summaryPath}`,
							]
								.filter(Boolean)
								.join("\n");
				out.emit(
					{
						ok: true,
						applied,
						missing,
						invalid,
						...slimReport(report, summaryPath),
					},
					human,
				);
				if (report.failed > 0) process.exitCode = 1;
				return;
			}

			const manifest = await loadManifest();
			if (manifest) {
				const personas = personasFromManifest(manifest);
				const missing = validatePersonas(personas);
				if (missing.length > 0) {
					throw new Error(formatMissingEnv(missing));
				}
			}

			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const report = await runGraph({
				baseUrl,
				threshold: parseThreshold(opts.threshold),
				concurrency: opts.concurrency
					? parsePositiveInteger(opts.concurrency, "--concurrency")
					: undefined,
				emitDiffPng: opts.diffPng,
				junitPath: opts.junit,
				judge: parseJudge(opts.judge),
				onEvent: makeProgressReporter(out),
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
