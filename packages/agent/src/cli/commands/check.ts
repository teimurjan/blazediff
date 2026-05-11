import type { Command } from "commander";
import { runCheck } from "../../check";
import { loadConfig, resolveBaseUrl } from "../../config";
import { DEFAULT_THRESHOLD } from "../../defaults";
import { paths } from "../../paths";
import type { CheckResult } from "../../types";
import type { Output } from "../output";

interface Opts {
	baseUrl?: string;
	threshold: string;
	concurrency?: string;
	diffPng: boolean;
	junit?: string;
}

function failureLines(results: CheckResult[]): string[] {
	return results
		.filter((r) => r.status !== "pass")
		.flatMap((r) => {
			const lines: string[] = [];
			if (r.verdict) {
				lines.push(`  ✗ ${r.id}  [${r.verdict.label}]  ${r.verdict.headline}`);
				lines.push(`      → ${r.verdict.action}`);
			} else {
				const detail =
					typeof r.diffPercentage === "number"
						? `${r.status} (${r.diffPercentage.toFixed(3)}%)`
						: r.status;
				lines.push(`  ✗ ${r.id}: ${detail}`);
			}
			if (r.diffPath) lines.push(`      diff: ${r.diffPath}`);
			return lines;
		});
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
		.option("--concurrency <n>", "max entries checked in parallel (default: 4)")
		.option("--no-diff-png", "skip writing diff PNGs")
		.option("--junit <path>", "write JUnit XML to this path (default: skipped)")
		.action(async (opts: Opts) => {
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const report = await runCheck({
				baseUrl,
				threshold: Number(opts.threshold),
				concurrency: opts.concurrency ? Number(opts.concurrency) : undefined,
				emitDiffPng: opts.diffPng,
				junitPath: opts.junit,
			});

			const human =
				report.failed === 0
					? `${report.passed}/${report.totalEntries} passed`
					: [
							`${report.passed}/${report.totalEntries} passed (${report.failed} failed):`,
							...failureLines(report.results),
							`  report: ${paths().report}`,
						].join("\n");

			out.emit(report, human);
			if (report.failed > 0) process.exitCode = 1;
		});
}
