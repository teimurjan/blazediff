import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { type CaptureRouteInput, runCaptures } from "../../captures";
import { loadConfig, resolveBaseUrl } from "../../config";
import { loadManifest } from "../../manifest";
import { paths } from "../../paths";
import type { Manifest } from "../../types";
import type { Output } from "../output";

interface Opts {
	failed?: boolean;
	all?: boolean;
	baseUrl?: string;
}

interface ReportShape {
	results: Array<{ id: string; status: string }>;
}

async function resolveTargets(
	manifest: Manifest,
	ids: string[],
	opts: Opts,
): Promise<Set<string>> {
	const exclusive = [
		ids.length > 0,
		Boolean(opts.failed),
		Boolean(opts.all),
	].filter(Boolean).length;
	if (exclusive === 0) throw new Error("provide ids, --failed, or --all");
	if (exclusive > 1)
		throw new Error("ids / --failed / --all are mutually exclusive");

	if (opts.all) return new Set(manifest.entries.map((e) => e.id));

	if (opts.failed) {
		const reportPath = paths().report;
		if (!existsSync(reportPath)) {
			throw new Error(
				`no report at ${reportPath}. Run \`blazediff-agent check\` first.`,
			);
		}
		const report = JSON.parse(
			await readFile(reportPath, "utf8"),
		) as ReportShape;
		return new Set(
			report.results.filter((r) => r.status !== "pass").map((r) => r.id),
		);
	}

	const targets = new Set(ids);
	const missing = ids.filter(
		(id) => !manifest.entries.some((e) => e.id === id),
	);
	if (missing.length) throw new Error(`unknown ids: ${missing.join(", ")}`);
	return targets;
}

export function registerRewrite(program: Command, out: Output): void {
	program
		.command("rewrite [ids...]")
		.description(
			"rewrite baselines for existing manifest entries, preserving mask/viewport/etc. Pick targets via positional ids, --failed (from last report.json), or --all.",
		)
		.option("--failed", "rewrite entries that failed the most recent check")
		.option("--all", "rewrite every manifest entry")
		.option("--base-url <url>", "override base URL")
		.action(async (ids: string[], opts: Opts) => {
			const manifest = await loadManifest();
			if (!manifest) throw new Error("no manifest. Run authoring first.");
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);

			const targets = await resolveTargets(manifest, ids, opts);
			if (targets.size === 0 && opts.failed) {
				out.emit({ ok: true, rewritten: 0 }, "no failed entries to rewrite");
				return;
			}

			const routes: CaptureRouteInput[] = manifest.entries
				.filter((e) => targets.has(e.id))
				.map((e) => ({
					id: e.id,
					url: e.url,
					mask: e.mask,
					viewport: e.viewport,
					waitFor: e.waitFor,
					fullPage: e.fullPage,
				}));

			const report = await runCaptures({
				baseUrl,
				routes,
				mode: "baseline",
				writeManifest: true,
			});

			const failureLines = report.results
				.filter((r) => !r.ok)
				.map((r) => `  ✗ ${r.id}: ${r.error ?? "failed"}`);
			const human =
				report.failed === 0
					? `rewrote ${report.succeeded}/${report.total} baseline${report.total === 1 ? "" : "s"}`
					: [
							`rewrote ${report.succeeded}/${report.total} (${report.failed} failed):`,
							...failureLines,
						].join("\n");
			out.emit(report, human);
			if (report.failed > 0) process.exitCode = 1;
		});
}
