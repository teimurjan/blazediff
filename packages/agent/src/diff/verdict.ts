import type { ChangeRegion, InterpretResult } from "@blazediff/core-native";

export type VerdictLabel =
	| "regression-likely"
	| "intentional-likely"
	| "noise-likely"
	| "ambiguous";

export type VerdictAction =
	| "investigate"
	| "rewrite-if-intended"
	| "ignore-or-rewrite";

export interface Verdict {
	label: VerdictLabel;
	headline: string;
	rationale: string[];
	action: VerdictAction;
}

export interface DeriveVerdictInput {
	reason?: "pixel-diff" | "layout-diff" | "file-not-exists";
	interpretation?: InterpretResult;
	diffCount?: number;
	diffPercentage?: number;
}

const REGRESSIVE_TYPES = new Set(["content-change", "addition", "deletion"]);
const INTENTIONAL_TYPES = new Set(["color-change", "shift"]);
const NOISE_TYPES = new Set(["rendering-noise"]);
const ELEVATED_SEVERITY = new Set(["medium", "high"]);

const SUB_PERCEPTUAL_PCT = 0.01;

function pctText(pct: number | undefined): string {
	if (typeof pct !== "number") return "?%";
	return pct >= 0.01 ? `${pct.toFixed(2)}%` : `${pct.toFixed(3)}%`;
}

function countByType(regions: ChangeRegion[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const r of regions)
		counts.set(r.changeType, (counts.get(r.changeType) ?? 0) + 1);
	return counts;
}

function dominantType(counts: Map<string, number>): string {
	let best = "";
	let bestN = 0;
	for (const [type, n] of counts) {
		if (n > bestN) {
			best = type;
			bestN = n;
		}
	}
	return best;
}

function topPosition(regions: ChangeRegion[]): string | undefined {
	let best: ChangeRegion | undefined;
	for (const r of regions)
		if (!best || r.pixelCount > best.pixelCount) best = r;
	return best?.position;
}

function meanConfidence(regions: ChangeRegion[]): number {
	if (regions.length === 0) return 0;
	return regions.reduce((a, r) => a + (r.confidence ?? 0), 0) / regions.length;
}

function formatBreakdown(counts: Map<string, number>): string {
	return [...counts]
		.sort((a, b) => b[1] - a[1])
		.map(([type, n]) => `${n} ${type}`)
		.join(", ");
}

function buildHeadline(input: DeriveVerdictInput): string {
	const { reason, interpretation, diffCount, diffPercentage } = input;
	if (reason === "layout-diff") return "image dimensions changed";
	if (reason === "file-not-exists") return "baseline or actual capture missing";

	if (!interpretation || interpretation.regions.length === 0) {
		const px = diffCount?.toLocaleString() ?? "?";
		return `${px} px (${pctText(diffPercentage)}) - no region analysis`;
	}

	const regions = interpretation.regions;
	const counts = countByType(regions);
	const pos = topPosition(regions);
	const pct = pctText(diffPercentage ?? interpretation.diffPercentage);
	const sev = interpretation.severity ?? "?";

	if (regions.length === 1) {
		return `1 ${dominantType(counts)}${pos ? ` @ ${pos}` : ""} (${pct}, ${sev})`;
	}
	return `${regions.length} regions: ${formatBreakdown(counts)}${pos ? ` @ ${pos}` : ""} (${pct}, ${sev})`;
}

export function deriveVerdict(input: DeriveVerdictInput): Verdict {
	const { reason, interpretation, diffPercentage } = input;
	const headline = buildHeadline(input);

	if (reason === "layout-diff") {
		return {
			label: "regression-likely",
			headline,
			rationale: ["baseline and current image dimensions differ"],
			action: "investigate",
		};
	}

	if (reason === "file-not-exists") {
		return {
			label: "regression-likely",
			headline,
			rationale: ["baseline or actual capture is missing from disk"],
			action: "investigate",
		};
	}

	if (!interpretation || interpretation.regions.length === 0) {
		return {
			label: "ambiguous",
			headline,
			rationale: ["pixels differ but interpret returned no regions"],
			action: "investigate",
		};
	}

	const regions = interpretation.regions;
	const severity = interpretation.severity;
	const counts = countByType(regions);
	const allNoise = regions.every((r) => NOISE_TYPES.has(r.changeType));
	const allColor = regions.every((r) => r.changeType === "color-change");
	const allMoved = regions.every((r) => INTENTIONAL_TYPES.has(r.changeType));
	const hasRegressive = regions.some((r) => REGRESSIVE_TYPES.has(r.changeType));
	const pct =
		typeof diffPercentage === "number"
			? diffPercentage
			: interpretation.diffPercentage;

	if (allNoise) {
		return {
			label: "noise-likely",
			headline,
			rationale: ["all regions classified as rendering-noise"],
			action: "ignore-or-rewrite",
		};
	}

	// Sub-perceptual delta at "low" severity is AA noise, not a real regression.
	if (
		typeof pct === "number" &&
		pct < SUB_PERCEPTUAL_PCT &&
		severity === "low"
	) {
		return {
			label: "noise-likely",
			headline,
			rationale: [
				`delta < ${SUB_PERCEPTUAL_PCT}% (got ${pctText(pct)}) at "low" severity`,
				"sub-perceptual change - review optional",
			],
			action: "ignore-or-rewrite",
		};
	}

	if (hasRegressive && ELEVATED_SEVERITY.has(severity ?? "")) {
		const types = [...counts]
			.filter(([t]) => REGRESSIVE_TYPES.has(t))
			.map(([t, n]) => `${n} ${t}`)
			.join(", ");
		return {
			label: "regression-likely",
			headline,
			rationale: [
				`severity ${severity} with structural changes (${types})`,
				"likely affects content or layout, not just styling",
			],
			action: "investigate",
		};
	}

	if (allColor && meanConfidence(regions) > 0.7) {
		return {
			label: "intentional-likely",
			headline,
			rationale: [
				`${regions.length} color-change region${regions.length === 1 ? "" : "s"} with mean confidence > 0.7`,
				"edge structure preserved - looks like a theming / palette change",
			],
			action: "rewrite-if-intended",
		};
	}

	if (allMoved && !allColor) {
		return {
			label: "intentional-likely",
			headline,
			rationale: [
				"all regions are shift/color-change - content moved or restyled, structure preserved",
			],
			action: "rewrite-if-intended",
		};
	}

	return {
		label: "ambiguous",
		headline,
		rationale: [
			`mix of change types (${formatBreakdown(counts)}) at "${severity ?? "?"}" severity`,
			`${pctText(pct)} of image differs`,
		],
		action: "investigate",
	};
}
