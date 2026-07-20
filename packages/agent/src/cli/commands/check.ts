import type { Command } from "commander";
import { loadConfig, resolveBaseUrl } from "../../config";
import { DEFAULT_READY_TIMEOUT_MS, DEFAULT_THRESHOLD } from "../../defaults";
import { type RunEvent, runGraph } from "../../graph";
import { type ApplyJudgmentsResult, applyJudgments } from "../../judge";
import { paths } from "../../paths";
import {
	isPortOpen,
	type ServerHandle,
	startServer,
	stopServer,
} from "../../server/lifecycle";
import type { AgentConfig, CheckReport } from "../../types";
import { parseJudge, slimReport } from "../check-output";
import type { Output } from "../output";
import { parsePositiveInteger, parseThreshold } from "../parsers";
import { checkSummary } from "../render/check";
import { createProgress } from "../render/progress";
import { createDevServerProgress } from "../render/server";
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

/** 1 when the run has hard failures; undefined keeps the inherited success exit. */
function exitCodeFor(report: CheckReport): number | undefined {
	return report.failed > 0 ? 1 : undefined;
}
/**
 * Start the configured dev server if it is not already up. A server started by
 * `check` is returned to the caller and stopped after the run. An existing
 * server is attached but never owned or stopped.
 */
async function ensureDevServer(
	config: AgentConfig | null,
	out: Output,
): Promise<ServerHandle | null> {
	const devServer = config?.devServer;
	const port = devServer?.port;
	if (!devServer || !port) return null;

	const logPath = paths().serverLog;
	const progress = createDevServerProgress(out, {
		command: devServer.command,
		port,
		logPath,
	});
	progress.checking();
	if (await isPortOpen(port)) {
		progress.ready(true);
		return null;
	}

	progress.starting();
	try {
		const handle = await startServer({
			command: devServer.command,
			port,
			logPath,
			readyTimeoutMs: devServer.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
		});
		progress.ready(Boolean(handle.attached));
		return handle.attached ? null : handle;
	} catch (error) {
		progress.failed();
		throw error;
	}
}

async function stopCheckServer(
	server: ServerHandle,
	out: Output,
): Promise<void> {
	const human = !out.isQuiet() && !out.isJson();
	if (human) {
		process.stderr.write(
			`[blazediff] stopping dev server http://127.0.0.1:${server.port}\n`,
		);
	}
	const result = await stopServer(process.cwd(), server.port);
	if (!human) return;
	const status = result.killed ? "stopped" : "already stopped";
	process.stderr.write(`✓ dev server ${status} on :${server.port}\n`);
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
			const server = opts.baseUrl ? null : await ensureDevServer(config, out);
			try {
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
					checkSummary(report, reportPath, paths().judgments),
				);
				const code = exitCodeFor(report);
				if (code !== undefined) process.exitCode = code;
			} finally {
				if (server) await stopCheckServer(server, out);
			}
		});
}
