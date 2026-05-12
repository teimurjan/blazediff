import { ensureGitignore } from "../../cli/gitignore";
import { writeJudgments } from "../../judge/persist";
import { writeSummaryMarkdown } from "../../report/markdown";
import type { CheckReport } from "../../types";
import type { GraphStateType } from "../state";

export async function aggregateNode(
	state: GraphStateType,
): Promise<Partial<GraphStateType>> {
	const options = state.options;
	if (!options) throw new Error("aggregateNode: options missing");
	const manifest = state.manifest;
	if (!manifest) throw new Error("aggregateNode: manifest missing");

	const results = state.results;
	const passed = results.filter((r) => r.status === "pass").length;
	const pendingJudgments = results.filter(
		(r) => r.status === "needs-judgment",
	).length;
	const report: CheckReport = {
		createdAt: new Date().toISOString(),
		totalEntries: results.length,
		passed,
		failed: results.length - passed - pendingJudgments,
		pendingJudgments,
		results,
	};
	await writeJudgments({ report, manifest, cwd: options.cwd });
	await writeSummaryMarkdown(report, options.cwd);
	await ensureGitignore(options.cwd);
	return { report };
}
