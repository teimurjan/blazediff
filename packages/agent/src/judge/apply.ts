import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Verdict, VerdictAction, VerdictLabel } from "../diff/verdict";
import { paths } from "../paths";
import { writeJsonReport } from "../report/json";
import type { CheckReport, CheckResult } from "../types";

const VALID_LABELS: VerdictLabel[] = [
	"regression-likely",
	"intentional-likely",
	"noise-likely",
	"ambiguous",
];

const VALID_ACTIONS: VerdictAction[] = [
	"investigate",
	"rewrite-if-intended",
	"ignore-or-rewrite",
];

interface JudgmentFile {
	id: string;
	verdict: Verdict;
	rationale?: string;
	confidence?: number;
}

export interface ApplyJudgmentsResult {
	report: CheckReport;
	applied: string[];
	missing: string[];
	invalid: string[];
}

function parseJudgment(raw: unknown): JudgmentFile | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.id !== "string") return null;
	const v = r.verdict as Record<string, unknown> | undefined;
	if (!v || typeof v !== "object") return null;
	if (
		typeof v.label !== "string" ||
		!VALID_LABELS.includes(v.label as VerdictLabel)
	)
		return null;
	if (typeof v.headline !== "string") return null;
	if (
		typeof v.action !== "string" ||
		!VALID_ACTIONS.includes(v.action as VerdictAction)
	)
		return null;
	const rationale = Array.isArray(v.rationale)
		? v.rationale.filter((x): x is string => typeof x === "string")
		: [];
	return {
		id: r.id,
		verdict: {
			label: v.label as VerdictLabel,
			headline: v.headline,
			rationale,
			action: v.action as VerdictAction,
		},
		rationale: typeof r.rationale === "string" ? r.rationale : undefined,
		confidence: typeof r.confidence === "number" ? r.confidence : undefined,
	};
}

async function readJudgments(dir: string): Promise<{
	parsed: JudgmentFile[];
	invalid: string[];
}> {
	const parsed: JudgmentFile[] = [];
	const invalid: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return { parsed, invalid };
	}
	for (const name of entries) {
		if (!name.endsWith(".json")) continue;
		const file = path.join(dir, name);
		try {
			const raw = JSON.parse(await readFile(file, "utf8"));
			const judgment = parseJudgment(raw);
			if (judgment) parsed.push(judgment);
			else invalid.push(file);
		} catch {
			invalid.push(file);
		}
	}
	return { parsed, invalid };
}

function applyToResult(
	result: CheckResult,
	judgment: JudgmentFile,
): CheckResult {
	const message =
		judgment.rationale ??
		(judgment.confidence !== undefined
			? `judged (confidence ${judgment.confidence.toFixed(2)})`
			: "judged");
	return {
		...result,
		status: "fail",
		verdict: judgment.verdict,
		message,
	};
}

export async function applyJudgments(
	cwd: string = process.cwd(),
): Promise<ApplyJudgmentsResult> {
	const p = paths(cwd);
	let report: CheckReport;
	try {
		report = JSON.parse(await readFile(p.report, "utf8")) as CheckReport;
	} catch {
		throw new Error(
			`no report found at ${p.report}. Run \`blazediff-agent check --judge host\` first.`,
		);
	}

	const { parsed, invalid } = await readJudgments(p.judgments);
	const byId = new Map(parsed.map((j) => [j.id, j]));
	const applied: string[] = [];
	const missing: string[] = [];

	const updated = report.results.map((r) => {
		if (r.status !== "needs-judgment") return r;
		const judgment = byId.get(r.id);
		if (!judgment) {
			missing.push(r.id);
			return r;
		}
		applied.push(r.id);
		return applyToResult(r, judgment);
	});

	const passed = updated.filter((r) => r.status === "pass").length;
	const pendingJudgments = updated.filter(
		(r) => r.status === "needs-judgment",
	).length;
	const next: CheckReport = {
		...report,
		results: updated,
		passed,
		pendingJudgments,
		failed: updated.length - passed - pendingJudgments,
	};
	await writeJsonReport(next, cwd);

	for (const id of applied) {
		await rm(path.join(p.pendingJudgments, id), {
			recursive: true,
			force: true,
		});
	}

	return { report: next, applied, missing, invalid };
}
