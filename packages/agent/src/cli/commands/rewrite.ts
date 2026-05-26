import { existsSync, statSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { type CaptureRouteInput, runCaptures } from "../../captures";
import { loadConfig, resolveBaseUrl } from "../../config";
import { childrenOf, isDerived, loadManifest } from "../../manifest";
import { paths } from "../../paths";
import type { Manifest } from "../../types";
import type { Output } from "../output";

interface Opts {
	failed?: boolean;
	all?: boolean;
	baseUrl?: string;
}

// Artifacts from the previous check (actual screenshots, diff PNGs, judgment
// folders) describe a comparison against the OLD baseline. Once that baseline
// is rewritten, those artifacts are stale; summary.md + the suspended graph
// checkpoint are stale regardless of which ids were rewritten.
async function cleanupAfterRewrite(
	rewrittenIds: string[],
	scopeAll: boolean,
): Promise<void> {
	const p = paths();
	if (scopeAll) {
		await Promise.all([
			rm(p.actual, { recursive: true, force: true }),
			rm(p.judgments, { recursive: true, force: true }),
			rm(p.checkpoints, { recursive: true, force: true }),
			rm(p.summary, { force: true }),
		]);
		return;
	}
	const perId = rewrittenIds.flatMap((id) => [
		rm(path.join(p.actual, `${id}.png`), { force: true }),
		rm(path.join(p.actual, `${id}.diff.png`), { force: true }),
		rm(path.join(p.judgments, id), { recursive: true, force: true }),
	]);
	await Promise.all([
		...perId,
		rm(p.summary, { force: true }),
		rm(p.checkpoints, { recursive: true, force: true }),
	]);
}

// Targets may name derived sub-entries; you can't re-shoot a child without
// re-running its parent's harness, so collapse to base ids and pull in every
// sibling child (they're regenerated together).
function expandToBaseTargets(
	manifest: Manifest,
	targets: Set<string>,
): Set<string> {
	const byId = new Map(manifest.entries.map((e) => [e.id, e]));
	const base = new Set<string>();
	for (const id of targets) {
		const entry = byId.get(id);
		if (!entry) continue;
		base.add(isDerived(entry) && entry.parent ? entry.parent : id);
	}
	return base;
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
		const judgmentsDir = paths().judgments;
		if (!existsSync(judgmentsDir)) {
			throw new Error(
				`no judgments at ${judgmentsDir}. Run \`blazediff-agent check\` first.`,
			);
		}
		const names = await readdir(judgmentsDir);
		const failed = new Set<string>();
		for (const name of names) {
			const full = path.join(judgmentsDir, name);
			if (statSync(full).isDirectory()) failed.add(name);
		}
		return failed;
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
			"rewrite baselines for existing manifest entries, preserving mask/viewport/etc. Pick targets via positional ids, --failed (uses .blazediff/judgments/ from last check), or --all.",
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

			const baseTargets = expandToBaseTargets(manifest, targets);
			const routes: CaptureRouteInput[] = manifest.entries
				.filter((e) => !isDerived(e) && baseTargets.has(e.id))
				.map((e) => ({
					id: e.id,
					url: e.url,
					mask: e.mask,
					viewport: e.viewport,
					waitFor: e.waitFor,
					fullPage: e.fullPage,
					harnesses: e.harnesses,
				}));

			const report = await runCaptures({
				baseUrl,
				routes,
				mode: "baseline",
				writeManifest: true,
			});

			const succeededIds = report.results.filter((r) => r.ok).map((r) => r.id);
			if (succeededIds.length > 0) {
				// Children are regenerated alongside their base, so their stale
				// artifacts must be cleaned too.
				const childIds = succeededIds.flatMap((id) =>
					childrenOf(manifest, id).map((c) => c.id),
				);
				await cleanupAfterRewrite(
					[...succeededIds, ...childIds],
					Boolean(opts.all),
				);
			}

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
