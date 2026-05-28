import type { VerdictLabel } from "../diff/verdict";
import type { CheckReport, CheckResult, RegionSummary } from "../types";
import type {
	ReviewClass,
	ReviewEntry,
	ReviewPayload,
	ReviewRegion,
	ReviewRunMeta,
	ReviewStatus,
} from "./types";

const DEFAULT_DIMS = { width: 1280, height: 800 };

/** The four agent verdict labels collapse onto the design's three tint classes. */
export function mapLabelToClass(label: VerdictLabel | undefined): ReviewClass {
	switch (label) {
		case "regression-likely":
			return "regression";
		case "ambiguous":
			return "layout-shift";
		default:
			// intentional-likely and noise-likely both read as a benign change.
			return "intentional-likely";
	}
}

function mapRegion(region: RegionSummary, index: number): ReviewRegion {
	return {
		id: index + 1,
		bbox: {
			x: region.bbox.x,
			y: region.bbox.y,
			w: region.bbox.width,
			h: region.bbox.height,
		},
		kind: region.changeType,
		pixels: region.pixelCount,
		change: region.percentage,
	};
}

function reviewStatus(r: CheckResult): ReviewStatus {
	if (r.review === "approved") return "approved";
	if (r.review === "rejected") return "rejected";
	return "unreviewed";
}

export function mapResultToEntry(r: CheckResult): ReviewEntry {
	return {
		id: r.id,
		name: r.id,
		url: r.url,
		width: r.width ?? DEFAULT_DIMS.width,
		height: r.height ?? DEFAULT_DIMS.height,
		diff: r.diffPercentage ?? 0,
		classification: mapLabelToClass(r.verdict?.label),
		severity: r.severity ?? "low",
		action: r.verdict?.action ?? "investigate",
		summary: r.verdict?.headline ?? r.message ?? r.status,
		changes: r.verdict?.rationale ?? [],
		regions: (r.regions ?? []).map(mapRegion),
		status: reviewStatus(r),
		reviewedBy: r.review ? "you" : undefined,
	};
}

/**
 * Build the review payload. The rail shows everything that isn't a clean pass,
 * plus entries the reviewer just approved (so they linger in the "Done" tab
 * instead of vanishing on reload).
 */
export function toReviewPayload(
	report: CheckReport,
	meta: Omit<ReviewRunMeta, "startedAt" | "total" | "failed" | "passed">,
): ReviewPayload {
	const entries = report.results
		.filter((r) => r.status !== "pass" || r.review === "approved")
		.map(mapResultToEntry);
	return {
		meta: {
			...meta,
			startedAt: report.createdAt,
			total: report.totalEntries,
			failed: report.failed,
			passed: report.passed,
		},
		entries,
	};
}
