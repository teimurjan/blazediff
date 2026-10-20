import type {
	ReviewClass,
	ReviewRegion,
	ReviewRunMeta,
	ReviewStatus,
} from "../types";

export type Decision = "pending" | "approved" | "bug";

export interface VerdictStyle {
	label: string;
	dot: string;
	text: string;
}

// Full class names so Tailwind's scanner picks them up.
export const VERDICTS: Record<ReviewClass, VerdictStyle> = {
	"intentional-likely": {
		label: "looks intended",
		dot: "bg-intended",
		text: "text-intended",
	},
	"layout-shift": {
		label: "unclear",
		dot: "bg-unclear",
		text: "text-unclear-ink",
	},
	regression: {
		label: "looks like a bug",
		dot: "bg-bug",
		text: "text-bug",
	},
};

export const VERDICT_ORDER: ReviewClass[] = [
	"intentional-likely",
	"layout-shift",
	"regression",
];

const SUGGESTIONS: Record<string, string> = {
	"rewrite-if-intended": "approve it and update the baseline.",
	"ignore-or-rewrite": "likely noise, approve it if it reads fine.",
	investigate: "worth a quick look before you decide.",
};

export function suggestionFor(action: string): string {
	return SUGGESTIONS[action] ?? SUGGESTIONS.investigate;
}

export function decisionOf(status: ReviewStatus): Decision {
	if (status === "approved") return "approved";
	if (status === "rejected") return "bug";
	return "pending";
}

export function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function regionsText(regions: ReviewRegion[]): string | null {
	if (regions.length === 0) return null;
	const pixels = regions.reduce((sum, region) => sum + region.pixels, 0);
	return `${plural(regions.length, "region", "regions")} · ${pixels.toLocaleString("en-US")} px`;
}

export function diffText(diff: number): string {
	return `${diff.toFixed(2)}%`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

export function runDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export interface GitRef {
	ref: string;
	sha: string;
}

/** Parses the server's "<ref> @ <sha>" string; the sha part may be missing. */
export function parseRef(value: string): GitRef | null {
	if (!value) return null;
	const [ref, sha = ""] = value.split(" @ ");
	return { ref, sha };
}

export interface RunRefs {
	before: string | null;
	after: string | null;
}

export function runRefs(meta: ReviewRunMeta): RunRefs {
	const candidate = parseRef(meta.candidate);
	return {
		before: parseRef(meta.baseline)?.ref ?? null,
		after: candidate ? candidate.sha || candidate.ref : null,
	};
}
