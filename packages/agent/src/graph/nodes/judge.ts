import { deriveVerdict } from "../../diff/verdict";
import { resolveJudge } from "../../judge";
import { signatureOf } from "../../judge/persist";
import type { CheckResult } from "../../types";
import { emitEvent } from "../events";
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

	// Skip and pass paths have no slow work — emit immediately and return.
	if (diff.skipResult) {
		emitEvent({ type: "result", result: diff.skipResult });
		return { results: [diff.skipResult] };
	}

	const outcome = diff.outcome;
	const baselinePath = diff.baselinePath;
	const captureOutputPath = diff.captureOutputPath;
	if (!outcome || !baselinePath || !captureOutputPath) {
		throw new Error("judgeNode: diff outputs missing");
	}

	if (outcome.match) {
		const r = passResult(entry, baselinePath, captureOutputPath);
		emitEvent({ type: "result", result: r });
		return { results: [r] };
	}

	const verdict = deriveVerdict({
		reason: outcome.reason,
		interpretation: outcome.interpretation,
		diffCount: outcome.diffCount,
		diffPercentage: outcome.diffPercentage,
	});
	const initial = failResult(
		entry,
		outcome,
		captureOutputPath,
		baselinePath,
		verdict,
	);

	// Defensive: failResult guarantees these for a non-match outcome.
	if (!initial.baselinePath || !initial.actualPath) {
		emitEvent({ type: "result", result: initial });
		return { results: [initial] };
	}

	// No outer semaphore: each backend owns its own pacing. Local serializes its
	// vision and classifier stages with two independent semaphores so the stages
	// pipeline across tests; host has no queue. `onJudgingStart` fires from
	// inside the backend at the real start moment, so "judging X" prints when
	// X actually begins, not when its branch dispatched.
	const judge = resolveJudge(options.judge);
	const output = await judge.judge(
		{
			entry,
			baselinePath: initial.baselinePath,
			actualPath: initial.actualPath,
			diffPath: initial.diffPath,
			regions: initial.regions,
			diffPercentage: initial.diffPercentage,
			severity: initial.severity,
			heuristicVerdict: initial.verdict ?? verdict,
			onJudgingStart:
				options.judge !== "none"
					? () =>
							emitEvent({ type: "judging", entryId: entry.id, url: entry.url })
					: undefined,
		},
		options.cwd,
	);

	let final: CheckResult;
	if (output.kind === "judged") {
		final = { ...initial, verdict: output.verdict };
	} else if (output.kind === "failed") {
		// Judge couldn't produce a verdict; fall back to its supplied verdict and
		// surface why in the result message so the report carries diagnostic
		// context instead of silently substituting the heuristic.
		console.warn(
			`[blazediff] judge "${judge.name}" failed for ${entry.id} (${output.reason}): ${output.error.message}`,
		);
		final = {
			...initial,
			verdict: output.fallback,
			message: `${initial.message ?? ""}${initial.message ? " — " : ""}judge failed (${output.reason}): ${output.error.message}`,
		};
	} else {
		const pending: CheckResult = {
			...initial,
			status: "needs-judgment",
			message: `awaiting judgment in ${output.requestPath}`,
		};
		const resumed = interruptForJudgment({
			kind: "host-judgment-required",
			entryId: entry.id,
			url: entry.url,
			requestPath: output.requestPath,
			signature: signatureOf(initial),
			pendingResult: pending,
		});
		final = resumed ? { ...initial, verdict: resumed } : pending;
	}
	emitEvent({ type: "result", result: final });
	return { results: [final] };
}
