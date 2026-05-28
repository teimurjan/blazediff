import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Verdict } from "../diff/verdict";
import { paths } from "../paths";
import { readReport, writeReport } from "../report/json";
import type { CheckReport, CheckResult } from "../types";
import { mapResultToEntry } from "./map";
import type { ReviewEntry } from "./types";

function recountReport(report: CheckReport): void {
	const passed = report.results.filter((r) => r.status === "pass").length;
	const pending = report.results.filter(
		(r) => r.status === "needs-judgment",
	).length;
	report.passed = passed;
	report.pendingJudgments = pending;
	report.failed = report.results.length - passed - pending;
}

/**
 * Approve = accept the reviewed candidate: promote the existing
 * `actual/<id>.png` to the baseline (no re-screenshot) and drop the now-stale
 * actual/diff/judgment artifacts. The report entry flips to a passing,
 * approved state so it stays green in CI and lingers in the UI's "Done" tab.
 */
export async function approveEntry(
	id: string,
	cwd: string = process.cwd(),
): Promise<ReviewEntry | null> {
	const p = paths(cwd);
	const actualPng = path.join(p.actual, `${id}.png`);
	if (!existsSync(actualPng)) return null;

	await mkdir(p.baselines, { recursive: true });
	await copyFile(actualPng, path.join(p.baselines, `${id}.png`));
	await Promise.all([
		rm(actualPng, { force: true }),
		rm(path.join(p.actual, `${id}.diff.png`), { force: true }),
		rm(path.join(p.judgments, id), { recursive: true, force: true }),
	]);

	const report = await readReport(cwd);
	const result = report?.results.find((r) => r.id === id);
	if (!report || !result) return null;

	result.status = "pass";
	result.review = "approved";
	result.diffPercentage = undefined;
	result.diffCount = undefined;
	result.regions = undefined;
	result.verdict = undefined;
	result.diffPath = undefined;
	recountReport(report);
	await writeReport(report, cwd);

	return mapResultToEntry(result);
}

/**
 * Reject = confirm a regression. Write a `regression-likely` verdict.json so
 * `check --apply-judgments` keeps the entry failing, and record the decision
 * in the report so the UI reflects it on reload.
 */
export async function rejectEntry(
	id: string,
	cwd: string = process.cwd(),
): Promise<ReviewEntry | null> {
	const report = await readReport(cwd);
	const result = report?.results.find((r) => r.id === id);
	if (!report || !result) return null;

	const verdict: Verdict = {
		label: "regression-likely",
		headline: result.verdict?.headline ?? "Confirmed regression during review",
		rationale: result.verdict?.rationale ?? [],
		action: "investigate",
	};

	const p = paths(cwd);
	const dir = path.join(p.judgments, id);
	await mkdir(dir, { recursive: true });
	await writeFile(
		path.join(dir, "verdict.json"),
		`${JSON.stringify({ id, verdict, rationale: "rejected via review" }, null, 2)}\n`,
		"utf8",
	);

	const updated: CheckResult = {
		...result,
		status: "fail",
		review: "rejected",
		verdict,
	};
	report.results = report.results.map((r) => (r.id === id ? updated : r));
	recountReport(report);
	await writeReport(report, cwd);

	return mapResultToEntry(updated);
}
