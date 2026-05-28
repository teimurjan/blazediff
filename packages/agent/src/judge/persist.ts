import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Verdict } from "../diff/verdict";
import { paths } from "../paths";
import type {
	CheckReport,
	CheckResult,
	Manifest,
	ManifestEntry,
	RegionSummary,
} from "../types";
import { fileExists, readJsonOrNull } from "../util/fs-json";
import type { VerdictFile } from "./types";

export interface JudgmentRequest {
	id: string;
	url: string;
	status: CheckResult["status"];
	diffPercentage?: number;
	severity?: string;
	regions?: RegionSummary[];
	paths: {
		baseline?: string;
		actual?: string;
		diff?: string;
		locator?: string;
		tiles?: string;
	};
	heuristicVerdict?: Verdict;
	manifestEntry: {
		viewport: ManifestEntry["viewport"];
		mask: ManifestEntry["mask"];
		waitFor: ManifestEntry["waitFor"];
		fullPage?: boolean;
	};
	signature: string;
	message?: string;
	instructions?: string;
	createdAt: string;
}

const HOST_INSTRUCTIONS = [
	"The visual-regression heuristic could not classify this diff confidently.",
	"Read `locator.png` AND `regions.png` in parallel - issue both Read calls in a single tool batch. locator.png is a small thumbnail of the diff with every change region outlined in red; regions.png is a vertical stack of [baseline | actual] pairs, one row per change region at native resolution. Row order matches the `regions[]` array (top = largest by pixelCount).",
	"Decide from the tile pairs. Only open the full diff / baseline / actual PNGs if the composite is itself ambiguous (e.g., a change clearly continues outside the cropped region).",
	"Decide whether the change is a regression, an intentional UI change, or rendering noise.",
	"Write your decision to `verdict.json` (next to this `request.json`) with shape:",
	'  { "id": string, "verdict": { "label": "regression-likely" | "intentional-likely" | "noise-likely", "headline": string, "rationale": string[], "action": "investigate" | "rewrite-if-intended" | "ignore-or-rewrite" }, "rationale": string, "confidence": number }',
	"Then re-run `blazediff-agent check --apply-judgments --json` to regenerate report.json.",
].join("\n");

function relTo(cwd: string, abs?: string): string | undefined {
	if (!abs) return undefined;
	return path.relative(cwd, abs).split(path.sep).join("/");
}

export function signatureOf(r: CheckResult): string {
	const pct =
		typeof r.diffPercentage === "number" ? r.diffPercentage.toFixed(4) : "?";
	const severity = r.severity ?? "?";
	// Hash the regions' essential shape so a re-classification (same count,
	// different type/size) invalidates a prior verdict. Sort first to make
	// signatures order-insensitive — the same regions in a different order are
	// the same diff and should reuse the verdict.
	const regions = (r.regions ?? [])
		.map((reg) => `${reg.changeType}:${reg.pixelCount}`)
		.sort()
		.join(",");
	const regionsKey = regions ? `[${regions}]` : "0";
	return `${r.status}|diff:${pct}|regions:${regionsKey}|severity:${severity}`;
}

function entryById(manifest: Manifest, id: string): ManifestEntry | undefined {
	return manifest.entries.find((e) => e.id === id);
}

function buildRequest(
	result: CheckResult,
	entry: ManifestEntry,
	cwd: string,
	tiles: { locatorPath?: string; tilesPath?: string },
): JudgmentRequest {
	const isAmbiguous =
		result.status === "needs-judgment" ||
		(result.verdict?.label === "ambiguous" && result.status === "fail");
	return {
		id: result.id,
		url: result.url,
		status: result.status,
		diffPercentage: result.diffPercentage,
		severity: result.severity,
		regions: result.regions,
		paths: {
			baseline: relTo(cwd, result.baselinePath),
			actual: relTo(cwd, result.actualPath),
			diff: relTo(cwd, result.diffPath),
			locator: tiles.locatorPath,
			tiles: tiles.tilesPath,
		},
		heuristicVerdict: result.verdict,
		manifestEntry: {
			viewport: entry.viewport,
			mask: entry.mask,
			waitFor: entry.waitFor,
			fullPage: entry.fullPage,
		},
		signature: signatureOf(result),
		message: result.message,
		instructions: isAmbiguous ? HOST_INSTRUCTIONS : undefined,
		createdAt: new Date().toISOString(),
	};
}

function autoVerdict(result: CheckResult): VerdictFile | null {
	if (!result.verdict) return null;
	if (result.status === "needs-judgment") return null;
	if (result.verdict.label === "ambiguous") return null;
	return {
		id: result.id,
		verdict: result.verdict,
		rationale: result.verdict.rationale.join(" "),
		confidence: 1,
	};
}

async function discoverTiles(dir: string): Promise<{
	locatorPath?: string;
	tilesPath?: string;
}> {
	const locatorAbs = path.join(dir, "locator.png");
	const tilesAbs = path.join(dir, "regions.png");
	const [locator, tiles] = await Promise.all([
		fileExists(locatorAbs),
		fileExists(tilesAbs),
	]);
	return {
		locatorPath: locator ? "locator.png" : undefined,
		tilesPath: tiles ? "regions.png" : undefined,
	};
}

export interface WriteJudgmentsOptions {
	report: CheckReport;
	manifest: Manifest;
	cwd?: string;
}

export async function writeJudgments(
	opts: WriteJudgmentsOptions,
): Promise<void> {
	const cwd = opts.cwd ?? process.cwd();
	const root = paths(cwd).judgments;
	await mkdir(root, { recursive: true });

	const knownIds = new Set<string>();
	for (const r of opts.report.results) knownIds.add(r.id);

	await Promise.all(
		opts.report.results.map(async (result) => {
			const dir = path.join(root, result.id);

			if (result.status === "pass") {
				if (await fileExists(dir))
					await rm(dir, { recursive: true, force: true });
				return;
			}

			const entry = entryById(opts.manifest, result.id);
			if (!entry) return;

			await mkdir(dir, { recursive: true });
			const tiles = await discoverTiles(dir);
			const request = buildRequest(result, entry, cwd, tiles);

			const requestFile = path.join(dir, "request.json");
			const verdictFile = path.join(dir, "verdict.json");
			const [prior, priorVerdict] = await Promise.all([
				readJsonOrNull<JudgmentRequest>(requestFile),
				fileExists(verdictFile).then((exists) =>
					exists ? readJsonOrNull<VerdictFile>(verdictFile) : null,
				),
			]);

			const signatureMatches =
				prior !== null && prior.signature === request.signature;

			await writeFile(
				requestFile,
				`${JSON.stringify(request, null, 2)}\n`,
				"utf8",
			);

			if (priorVerdict && signatureMatches) {
				return;
			}

			const auto = autoVerdict(result);
			if (auto) {
				await writeFile(
					verdictFile,
					`${JSON.stringify(auto, null, 2)}\n`,
					"utf8",
				);
			} else if (priorVerdict && !signatureMatches) {
				await rm(verdictFile, { force: true });
			}
		}),
	);

	let entries: string[];
	try {
		entries = await readdir(root);
	} catch {
		return;
	}
	await Promise.all(
		entries
			.filter((name) => !knownIds.has(name))
			.map((name) =>
				rm(path.join(root, name), { recursive: true, force: true }),
			),
	);
}
