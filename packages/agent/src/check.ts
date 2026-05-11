import path from "node:path";
import { captureScreenshot } from "./browser/capture";
import { closeBrowser } from "./browser/launch";
import { DEFAULT_FULL_PAGE } from "./defaults";
import { type DiffOutcome, diffEntry } from "./diff";
import { deriveVerdict } from "./diff/verdict";
import { isEntryStale, loadManifest } from "./manifest";
import { paths } from "./paths";
import { writeJsonReport } from "./report/json";
import { writeJunit } from "./report/junit";
import type { CheckReport, CheckResult, ManifestEntry } from "./types";

export interface CheckOptions {
	baseUrl: string;
	cwd?: string;
	threshold?: number;
	concurrency?: number;
	emitDiffPng?: boolean;
	junitPath?: string;
}

const DEFAULT_CONCURRENCY = 4;

async function pool<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return results;
}

function passResult(
	entry: ManifestEntry,
	baselinePath: string,
	actualPath: string,
): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "pass",
		baselinePath,
		actualPath,
	};
}

function skipResult(entry: ManifestEntry, message: string): CheckResult {
	return { id: entry.id, url: entry.url, status: "pass", message };
}

function staleResult(entry: ManifestEntry): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "stale-baseline",
		message: "captureHash mismatch: entry was edited without re-capturing",
	};
}

function missingBaselineResult(
	entry: ManifestEntry,
	baselinePath: string,
): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "missing-baseline",
		message: `baseline missing at ${baselinePath}`,
	};
}

function failResult(
	entry: ManifestEntry,
	outcome: DiffOutcome,
	actualPath: string,
	baselinePath: string,
): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "fail",
		diffCount: outcome.diffCount,
		diffPercentage: outcome.diffPercentage,
		severity: outcome.interpretation?.severity,
		regions: outcome.interpretation?.regions,
		verdict: deriveVerdict({
			reason: outcome.reason,
			interpretation: outcome.interpretation,
			diffCount: outcome.diffCount,
			diffPercentage: outcome.diffPercentage,
		}),
		diffPath: outcome.diffPath,
		baselinePath,
		actualPath,
		message:
			outcome.reason === "layout-diff"
				? "layout differs (dimensions changed)"
				: `${outcome.diffCount ?? 0} pixels differ (${(outcome.diffPercentage ?? 0).toFixed(3)}%)`,
	};
}

async function checkEntry(
	entry: ManifestEntry,
	opts: CheckOptions,
	cwd: string,
	baselinesDir: string,
): Promise<CheckResult> {
	if (entry.auth === "required") {
		return skipResult(entry, "skipped: auth required (deferred to v0.2)");
	}
	if (isEntryStale(entry)) {
		return staleResult(entry);
	}

	const baselinePath = path.join(baselinesDir, `${entry.id}.png`);
	const capture = await captureScreenshot(
		opts.baseUrl,
		{
			id: entry.id,
			url: entry.url,
			viewport: entry.viewport,
			mask: entry.mask,
			waitFor: entry.waitFor,
			fullPage: entry.fullPage ?? DEFAULT_FULL_PAGE,
			mode: "actual",
		},
		cwd,
	);
	const outcome = await diffEntry(
		entry.id,
		baselinePath,
		capture.outputPath,
		{ threshold: opts.threshold, emitDiffPng: opts.emitDiffPng ?? true },
		cwd,
	);

	if (outcome.match) return passResult(entry, baselinePath, capture.outputPath);
	if (outcome.reason === "file-not-exists")
		return missingBaselineResult(entry, baselinePath);
	return failResult(entry, outcome, capture.outputPath, baselinePath);
}

export async function runCheck(opts: CheckOptions): Promise<CheckReport> {
	const cwd = opts.cwd ?? process.cwd();
	const manifest = await loadManifest(cwd);
	if (!manifest) {
		throw new Error(
			`no manifest found at ${paths(cwd).manifest}. Run \`blazediff init\` then \`/blazediff\` (or capture manually) first.`,
		);
	}

	const baselinesDir = paths(cwd).baselines;
	const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
	let results: CheckResult[];

	try {
		results = await pool(manifest.entries, concurrency, (entry) =>
			checkEntry(entry, opts, cwd, baselinesDir),
		);
	} finally {
		await closeBrowser();
	}

	const passed = results.filter((r) => r.status === "pass").length;
	const report: CheckReport = {
		createdAt: new Date().toISOString(),
		totalEntries: results.length,
		passed,
		failed: results.length - passed,
		results,
	};
	await writeJsonReport(report, cwd);
	if (opts.junitPath) {
		const target = path.isAbsolute(opts.junitPath)
			? opts.junitPath
			: path.join(cwd, opts.junitPath);
		await writeJunit(report, target);
	}
	return report;
}
