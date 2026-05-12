import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import { prepareTiles, type TilePrepResult } from "./tiles";
import type {
	Judge,
	JudgeInput,
	JudgeOutput,
	JudgmentRequestRegion,
} from "./types";

export interface JudgmentRequest {
	id: string;
	url: string;
	baselinePath: string;
	actualPath: string;
	diffPath?: string;
	diffPercentage?: number;
	severity?: string;
	regions?: JudgmentRequestRegion[];
	locatorPath?: string;
	heuristicVerdict: JudgeInput["heuristicVerdict"];
	manifestEntry: {
		viewport: JudgeInput["entry"]["viewport"];
		mask: JudgeInput["entry"]["mask"];
		waitFor: JudgeInput["entry"]["waitFor"];
		fullPage?: boolean;
	};
	instructions: string;
	createdAt: string;
}

const INSTRUCTIONS = [
	"The visual-regression heuristic could not classify this diff confidently.",
	"Read `locator.png` first (a thumbnail of the diff with all change regions outlined in red) for spatial context.",
	"Then read each `regions[i].tilePath` in order — they are `[baseline | actual | diff]` strips of the changed area at native resolution. Decide from these.",
	"Only open the full `diffPath` / `baselinePath` / `actualPath` if the tiles are themselves ambiguous (e.g., the change clearly continues outside the cropped region).",
	"Decide whether the change is a regression, an intentional UI change, or rendering noise.",
	"Write your decision to `.blazediff/judgments/<id>.json` with shape:",
	'  { "id": string, "verdict": { "label": "regression-likely" | "intentional-likely" | "noise-likely", "headline": string, "rationale": string[], "action": "investigate" | "rewrite-if-intended" | "ignore-or-rewrite" }, "rationale": string, "confidence": number }',
	"Then re-run `blazediff-agent check --apply-judgments --json` to merge verdicts back into report.json.",
].join("\n");

function narrowRegions(
	input: JudgeInput["regions"],
	tilesByIndex: Map<number, string>,
): JudgmentRequestRegion[] | undefined {
	if (!input || input.length === 0) return undefined;
	return input.map((r, i) => ({
		bbox: r.bbox,
		pixelCount: r.pixelCount,
		percentage: r.percentage,
		changeType: r.changeType,
		confidence: r.confidence,
		tilePath: tilesByIndex.get(i),
	}));
}

async function tryPrepareTiles(
	input: JudgeInput,
	entryDir: string,
): Promise<TilePrepResult | null> {
	if (!input.regions || input.regions.length === 0 || !input.diffPath) {
		return null;
	}
	try {
		return await prepareTiles({
			regions: input.regions,
			baselinePath: input.baselinePath,
			actualPath: input.actualPath,
			diffPath: input.diffPath,
			outputDir: entryDir,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(
			`[blazediff] tile generation failed for ${input.entry.id}: ${message}`,
		);
		return null;
	}
}

export const hostHarnessJudge: Judge = {
	name: "host",
	async judge(input: JudgeInput, cwd: string): Promise<JudgeOutput> {
		const entryDir = path.join(paths(cwd).pendingJudgments, input.entry.id);
		await mkdir(entryDir, { recursive: true });

		const tiles = await tryPrepareTiles(input, entryDir);

		const tilesByIndex = new Map<number, string>();
		if (tiles && input.regions) {
			const ranked = [...input.regions]
				.map((r, i) => ({ r, i }))
				.sort((a, b) => b.r.pixelCount - a.r.pixelCount)
				.slice(0, tiles.regions.length);
			ranked.forEach((entry, rank) => {
				const tile = tiles.regions[rank];
				if (tile) tilesByIndex.set(entry.i, tile.tilePath);
			});
		}

		const requestPath = path.join(entryDir, "request.json");
		const request: JudgmentRequest = {
			id: input.entry.id,
			url: input.entry.url,
			baselinePath: input.baselinePath,
			actualPath: input.actualPath,
			diffPath: input.diffPath,
			diffPercentage: input.diffPercentage,
			severity: input.severity,
			regions: narrowRegions(input.regions, tilesByIndex),
			locatorPath: tiles?.locatorPath,
			heuristicVerdict: input.heuristicVerdict,
			manifestEntry: {
				viewport: input.entry.viewport,
				mask: input.entry.mask,
				waitFor: input.entry.waitFor,
				fullPage: input.entry.fullPage,
			},
			instructions: INSTRUCTIONS,
			createdAt: new Date().toISOString(),
		};
		await writeFile(
			requestPath,
			`${JSON.stringify(request, null, 2)}\n`,
			"utf8",
		);
		return { kind: "deferred", requestPath };
	},
};
