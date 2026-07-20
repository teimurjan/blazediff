// Wire shapes shared by the review server (Node) and the client SPA (browser).
// The client imports these types only (erased at build), never Node modules.

export type ReviewStatus = "unreviewed" | "approved" | "rejected";

/** Design's CSS tint classes; mapped from the agent's VerdictLabel. */
export type ReviewClass = "intentional-likely" | "regression" | "layout-shift";

export interface ReviewRegion {
	id: number;
	bbox: { x: number; y: number; w: number; h: number };
	kind: string; // changeType
	pixels: number; // pixelCount
	change: number; // percentage
}

export interface ReviewImageSize {
	width: number;
	height: number;
}

export interface ReviewEntry {
	id: string;
	name: string;
	url: string;
	width: number;
	height: number;
	baselineSize?: ReviewImageSize;
	candidateSize?: ReviewImageSize;
	diff: number; // diffPercentage
	classification: ReviewClass;
	severity: string;
	action: string; // verdict.action
	summary: string; // verdict.headline
	changes: string[]; // verdict.rationale
	regions: ReviewRegion[];
	status: ReviewStatus;
	reviewedAt?: string;
	reviewedBy?: string;
}

export interface ReviewRunMeta {
	name: string;
	baseline: string; // "<ref> @ <sha>" best-effort, else ""
	candidate: string;
	startedAt: string; // report.createdAt
	threshold: number;
	total: number;
	failed: number;
	passed: number;
}

export interface ReviewPayload {
	meta: ReviewRunMeta;
	entries: ReviewEntry[];
}

/** Response from approve/reject endpoints. */
export interface ReviewActionResult {
	ok: boolean;
	entry?: ReviewEntry;
	error?: string;
}
