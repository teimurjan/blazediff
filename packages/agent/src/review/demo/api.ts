// Static stand-in for ../client/api.ts, swapped in by vite.demo.config.mts.
// The data under public/data is a real check of examples/agent-auth-spa-example
// with three planted changes, judged and applied through the CLI.
import type { CheckReport } from "../../types";
import type * as RealApi from "../client/api";
import type { Result } from "../client/api";
import { toReviewPayload } from "../map";
import type { ReviewEntry, ReviewPayload } from "../types";

const META = {
	name: "agent-auth-spa-example",
	baseline: "main @ b7a12ce",
	candidate: "pricing-refresh @ 4c1e9a2",
	threshold: 0.1,
};

let payload: ReviewPayload | null = null;

export function imgUrl(
	id: string,
	kind: "baseline" | "actual" | "diff",
): string {
	return `data/${kind}/${encodeURIComponent(id)}.png`;
}

export async function fetchReport(): Promise<Result<ReviewPayload>> {
	try {
		const res = await fetch("data/report.json");
		if (!res.ok) return { ok: false, error: "demo report is missing" };
		payload = toReviewPayload((await res.json()) as CheckReport, META);
		return { ok: true, value: payload };
	} catch {
		return { ok: false, error: "demo report is missing" };
	}
}

export async function fetchDiffImage(id: string): Promise<Uint8Array | null> {
	try {
		const res = await fetch(imgUrl(id, "diff"));
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

/** Nothing is written in the demo; the decision only lives in the page. */
export async function postDecision(
	id: string,
	action: "approve" | "reject",
): Promise<Result<ReviewEntry>> {
	const entry = payload?.entries.find((candidate) => candidate.id === id);
	if (!entry) return { ok: false, error: `cannot ${action} ${id}` };
	return {
		ok: true,
		value: {
			...entry,
			status: action === "approve" ? "approved" : "rejected",
			reviewedBy: "you",
		},
	};
}

({
	imgUrl,
	fetchReport,
	fetchDiffImage,
	postDecision,
}) satisfies typeof RealApi;
