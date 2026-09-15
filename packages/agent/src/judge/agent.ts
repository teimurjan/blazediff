import { mkdir } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import { prepareTiles, type TilePrepResult } from "./tiles";
import type { Judge, JudgeInput, JudgeOutput } from "./types";

async function tryPrepareTiles(
	input: JudgeInput,
	entryDir: string,
): Promise<TilePrepResult | null> {
	if (!input.regions || input.regions.length === 0) {
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

export const agentJudge: Judge = {
	name: "agent",
	async judge(input: JudgeInput, cwd: string): Promise<JudgeOutput> {
		// The agent backend has no internal queue (just file IO + an interrupt), so
		// "start" is immediate. Local's fires later, gated by its vision semaphore.
		input.onJudgingStart?.();
		const p = paths(cwd);
		const entryDir = path.join(p.judgments, input.entry.id);
		await mkdir(entryDir, { recursive: true });
		await tryPrepareTiles(input, entryDir);
		return { kind: "deferred", requestPath: entryDir };
	},
};
