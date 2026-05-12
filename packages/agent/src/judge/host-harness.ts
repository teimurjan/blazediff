import { mkdir } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import { prepareTiles, type TilePrepResult } from "./tiles";
import type { Judge, JudgeInput, JudgeOutput } from "./types";

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
		const p = paths(cwd);
		const entryDir = path.join(p.judgments, input.entry.id);
		await mkdir(entryDir, { recursive: true });
		await tryPrepareTiles(input, entryDir);
		return { kind: "deferred", requestPath: entryDir };
	},
};
