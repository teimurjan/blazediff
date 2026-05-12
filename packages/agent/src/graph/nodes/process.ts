import path from "node:path";
import { captureScreenshot } from "../../browser/capture";
import { DEFAULT_FULL_PAGE } from "../../defaults";
import { type DiffOutcome, diffEntry } from "../../diff";
import { deriveVerdict, type Verdict } from "../../diff/verdict";
import { resolveJudge } from "../../judge";
import { isEntryStale } from "../../manifest";
import type { CheckResult, ManifestEntry } from "../../types";
import type { Semaphore } from "../semaphore";
import type { GraphStateType } from "../state";

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
	verdict: Verdict,
): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "fail",
		diffCount: outcome.diffCount,
		diffPercentage: outcome.diffPercentage,
		severity: outcome.interpretation?.severity,
		regions: outcome.interpretation?.regions,
		verdict,
		diffPath: outcome.diffPath,
		baselinePath,
		actualPath,
		message:
			outcome.reason === "layout-diff"
				? "layout differs (dimensions changed)"
				: `${outcome.diffCount ?? 0} pixels differ (${(outcome.diffPercentage ?? 0).toFixed(3)}%)`,
	};
}

export function makeProcessNode(semaphore: Semaphore) {
	return async function processNode(
		state: GraphStateType,
	): Promise<Partial<GraphStateType>> {
		const entry = state.entry;
		const options = state.options;
		if (!entry || !options) {
			throw new Error("processNode: entry or options missing");
		}

		if (entry.auth === "required") {
			return {
				results: [
					skipResult(entry, "skipped: auth required (deferred to v0.2)"),
				],
			};
		}
		if (isEntryStale(entry)) {
			return { results: [staleResult(entry)] };
		}

		const capture = await semaphore.run(() =>
			captureScreenshot(
				options.baseUrl,
				{
					id: entry.id,
					url: entry.url,
					viewport: entry.viewport,
					mask: entry.mask,
					waitFor: entry.waitFor,
					fullPage: entry.fullPage ?? DEFAULT_FULL_PAGE,
					mode: "actual",
				},
				options.cwd,
			),
		);

		const baselinePath = path.join(options.baselinesDir, `${entry.id}.png`);
		const outcome = await diffEntry(
			entry.id,
			baselinePath,
			capture.outputPath,
			{ threshold: options.threshold, emitDiffPng: options.emitDiffPng },
			options.cwd,
		);

		if (outcome.match) {
			return { results: [passResult(entry, baselinePath, capture.outputPath)] };
		}
		if (outcome.reason === "file-not-exists") {
			return { results: [missingBaselineResult(entry, baselinePath)] };
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
			capture.outputPath,
			baselinePath,
			verdict,
		);

		if (
			result.verdict?.label === "ambiguous" &&
			result.baselinePath &&
			result.actualPath
		) {
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
					heuristicVerdict: result.verdict,
				},
				options.cwd,
			);
			if (output.kind === "judged") {
				result = { ...result, verdict: output.verdict };
			} else {
				result = {
					...result,
					status: "needs-judgment",
					message: `awaiting judgment at ${output.requestPath}`,
				};
			}
		}

		return { results: [result] };
	};
}
