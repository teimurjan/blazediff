import type { ChangeRegion } from "@blazediff/core-native";
import type { DiffOutcome } from "../../diff";
import type { Verdict } from "../../diff/verdict";
import type { CheckResult, ManifestEntry, RegionSummary } from "../../types";

export function narrowRegion(r: ChangeRegion): RegionSummary {
	return {
		bbox: r.bbox,
		pixelCount: r.pixelCount,
		percentage: r.percentage,
		changeType: r.changeType,
		confidence: r.confidence,
	};
}

export function skipResult(entry: ManifestEntry, message: string): CheckResult {
	return { id: entry.id, url: entry.url, status: "pass", message };
}

export function staleResult(entry: ManifestEntry): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "stale-baseline",
		message: "captureHash mismatch: entry was edited without re-capturing",
	};
}

export function errorResult(
	entry: ManifestEntry,
	message: string,
): CheckResult {
	return {
		id: entry.id,
		url: entry.url,
		status: "fail",
		message,
	};
}

export function passResult(
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

export function missingBaselineResult(
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

export function failResult(
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
		regions: outcome.interpretation?.regions?.map(narrowRegion),
		width: outcome.interpretation?.width,
		height: outcome.interpretation?.height,
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
