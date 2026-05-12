import { deriveVerdict } from "../../diff/verdict";
import { resolveJudge } from "../../judge";
import { signatureOf } from "../../judge/persist";
import { interruptForJudgment } from "../interrupt";
import type { BranchStateType } from "../state";
import { failResult, passResult } from "./results";

export async function judgeNode(
	state: BranchStateType,
): Promise<Partial<BranchStateType>> {
	const entry = state.entry;
	const options = state.options;
	const diff = state.diffOutput;
	if (!entry || !options || !diff) {
		throw new Error("judgeNode: entry, options, or diff missing");
	}

	if (diff.skipResult) {
		return { results: [diff.skipResult] };
	}

	const outcome = diff.outcome;
	const baselinePath = diff.baselinePath;
	const captureOutputPath = diff.captureOutputPath;
	if (!outcome || !baselinePath || !captureOutputPath) {
		throw new Error("judgeNode: diff outputs missing");
	}

	if (outcome.match) {
		return { results: [passResult(entry, baselinePath, captureOutputPath)] };
	}

	const verdict = deriveVerdict({
		reason: outcome.reason,
		interpretation: outcome.interpretation,
		diffCount: outcome.diffCount,
		diffPercentage: outcome.diffPercentage,
	});
	let result = failResult(
		entry,
		outcome,
		captureOutputPath,
		baselinePath,
		verdict,
	);

	// Route every non-match through the configured judge so the host gets
	// regions.png + locator.png + a verdict.json round-trip for *all* fails,
	// not just the heuristic's "ambiguous" bucket. `noneJudge` is a no-op.
	if (result.baselinePath && result.actualPath) {
		const judge = resolveJudge(options.judge);
		const output = await judge.judge(
			{
				entry,
				baselinePath: result.baselinePath,
				actualPath: result.actualPath,
				diffPath: result.diffPath,
				regions: result.regions,
				diffPercentage: result.diffPercentage,
				severity: result.severity,
				heuristicVerdict: result.verdict ?? verdict,
			},
			options.cwd,
		);
		if (output.kind === "judged") {
			result = { ...result, verdict: output.verdict };
		} else {
			const pending = {
				...result,
				status: "needs-judgment" as const,
				message: `awaiting judgment in ${output.requestPath}`,
			};
			const resumed = interruptForJudgment({
				kind: "host-judgment-required",
				entryId: entry.id,
				url: entry.url,
				requestPath: output.requestPath,
				signature: signatureOf(result),
				pendingResult: pending,
			});
			result = resumed ? { ...result, verdict: resumed } : pending;
		}
	}

	return { results: [result] };
}
