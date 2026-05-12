import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Verdict, VerdictAction, VerdictLabel } from "../diff/verdict";
import { loadManifest } from "../manifest";
import { paths } from "../paths";
import { writeSummaryMarkdown } from "../report/markdown";
import type { CheckReport, CheckResult, ManifestEntry } from "../types";
import type { JudgmentRequest } from "./persist";
import type { VerdictFile } from "./types";

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

export interface ApplyJudgmentsResult {
	report: CheckReport;
	applied: string[];
	missing: string[];
	invalid: string[];
}

function parseVerdict(raw: unknown): VerdictFile | null {
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

async function readJsonOrNull<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch {
		return null;
	}
}

interface DirRead {
	id: string;
	request: JudgmentRequest | null;
	verdict: VerdictFile | null;
	verdictInvalid: boolean;
}

async function readJudgmentDirs(root: string): Promise<DirRead[]> {
	let names: string[];
	try {
		names = await readdir(root);
	} catch {
		return [];
	}
	const out: DirRead[] = [];
	for (const name of names) {
		const dir = path.join(root, name);
		let isDir = false;
		try {
			isDir = (await stat(dir)).isDirectory();
		} catch {
			isDir = false;
		}
		if (!isDir) continue;
		const request = await readJsonOrNull<JudgmentRequest>(
			path.join(dir, "request.json"),
		);
		const verdictFile = path.join(dir, "verdict.json");
		let verdict: VerdictFile | null = null;
		let verdictInvalid = false;
		if (existsSync(verdictFile)) {
			const raw = await readJsonOrNull<unknown>(verdictFile);
			verdict = raw ? parseVerdict(raw) : null;
			if (raw && !verdict) verdictInvalid = true;
		}
		out.push({ id: name, request, verdict, verdictInvalid });
	}
	return out;
}

function toAbs(cwd: string, rel?: string): string | undefined {
	if (!rel) return undefined;
	return path.isAbsolute(rel) ? rel : path.join(cwd, rel);
}

function buildResult(
	cwd: string,
	dir: DirRead,
	entry: ManifestEntry | undefined,
): CheckResult {
	const req = dir.request;
	const finalVerdict: Verdict | undefined =
		dir.verdict?.verdict ?? req?.heuristicVerdict;
	const status: CheckResult["status"] = req
		? dir.verdict
			? "fail"
			: req.status
		: "fail";
	const message =
		dir.verdict?.rationale ??
		(dir.verdict?.confidence !== undefined
			? `judged (confidence ${dir.verdict.confidence.toFixed(2)})`
			: req?.message);
	return {
		id: dir.id,
		url: req?.url ?? entry?.url ?? "",
		status,
		diffPercentage: req?.diffPercentage,
		severity: req?.severity,
		regions: req?.regions,
		verdict: finalVerdict,
		diffPath: toAbs(cwd, req?.paths.diff),
		actualPath: toAbs(cwd, req?.paths.actual),
		baselinePath: toAbs(cwd, req?.paths.baseline),
		message,
	};
}

function passResult(entry: ManifestEntry, cwd: string): CheckResult {
	const baselineAbs = path.join(paths(cwd).baselines, `${entry.id}.png`);
	const actualAbs = path.join(paths(cwd).actual, `${entry.id}.png`);
	return {
		id: entry.id,
		url: entry.url,
		status: "pass",
		baselinePath: baselineAbs,
		actualPath: existsSync(actualAbs) ? actualAbs : undefined,
	};
}

export async function applyJudgments(
	cwd: string = process.cwd(),
): Promise<ApplyJudgmentsResult> {
	const p = paths(cwd);
	const manifest = await loadManifest(cwd);
	if (!manifest) {
		throw new Error(
			`no manifest at ${p.manifest}. Run \`blazediff-agent init\` first.`,
		);
	}

	const dirs = await readJudgmentDirs(p.judgments);
	const dirById = new Map(dirs.map((d) => [d.id, d]));

	const applied: string[] = [];
	const missing: string[] = [];
	const invalid: string[] = [];

	for (const d of dirs) {
		if (d.verdictInvalid) invalid.push(path.join(p.judgments, d.id));
		else if (d.verdict) applied.push(d.id);
		else missing.push(d.id);
	}

	const nonPassResults: CheckResult[] = [];
	for (const d of dirs) {
		const entry = manifest.entries.find((e) => e.id === d.id);
		nonPassResults.push(buildResult(cwd, d, entry));
	}

	const passResults: CheckResult[] = [];
	for (const entry of manifest.entries) {
		if (dirById.has(entry.id)) continue;
		passResults.push(passResult(entry, cwd));
	}

	const results = [...passResults, ...nonPassResults];
	const passed = results.filter((r) => r.status === "pass").length;
	const pendingJudgments = results.filter(
		(r) => r.status === "needs-judgment",
	).length;
	const report: CheckReport = {
		createdAt: new Date().toISOString(),
		totalEntries: results.length,
		passed,
		failed: results.length - passed - pendingJudgments,
		pendingJudgments,
		results,
	};

	await writeSummaryMarkdown(report, cwd);

	return { report, applied, missing, invalid };
}
