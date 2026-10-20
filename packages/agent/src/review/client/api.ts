import type { ReviewActionResult, ReviewEntry, ReviewPayload } from "../types";

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function imgUrl(
	id: string,
	kind: "baseline" | "actual" | "diff",
): string {
	return `/api/image/${kind}/${encodeURIComponent(id)}`;
}

/** The agent's own diff PNG, or null when the run did not write one. */
export async function fetchDiffImage(id: string): Promise<Uint8Array | null> {
	try {
		const res = await fetch(imgUrl(id, "diff"));
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

export async function fetchReport(): Promise<Result<ReviewPayload>> {
	try {
		const res = await fetch("/api/report");
		const body = await res.json();
		if (!res.ok)
			return {
				ok: false,
				error: body.error ?? `report failed (${res.status})`,
			};
		return { ok: true, value: body as ReviewPayload };
	} catch {
		return { ok: false, error: "cannot reach the review server" };
	}
}

export async function postDecision(
	id: string,
	action: "approve" | "reject",
): Promise<Result<ReviewEntry>> {
	try {
		const res = await fetch(
			`/api/entries/${encodeURIComponent(id)}/${action}`,
			{ method: "POST" },
		);
		const body = (await res.json()) as ReviewActionResult;
		if (!body.ok || !body.entry)
			return { ok: false, error: body.error ?? `cannot ${action} ${id}` };
		return { ok: true, value: body.entry };
	} catch {
		return { ok: false, error: `cannot ${action} ${id}` };
	}
}
