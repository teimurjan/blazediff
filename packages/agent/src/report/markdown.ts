import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import type { CheckReport, CheckResult } from "../types";

const PREVIEW_WIDTH = 320;

function escapeCell(s: string): string {
	return s.replace(/\n/g, " ");
}

function toBlazediffRel(cwd: string, abs?: string): string | undefined {
	if (!abs) return undefined;
	const root = paths(cwd).root;
	const rel = path.isAbsolute(abs)
		? path.relative(root, abs)
		: path.relative(paths(cwd).root, path.join(cwd, abs));
	return rel.split(path.sep).join("/");
}

function img(src: string, alt: string): string {
	return `<img src="${src}" width="${PREVIEW_WIDTH}" alt="${alt}">`;
}

function baselineCell(r: CheckResult, cwd: string): string {
	const rel = toBlazediffRel(cwd, r.baselinePath) ?? `baselines/${r.id}.png`;
	return img(rel, `${r.id} baseline`);
}

function actualCell(r: CheckResult, cwd: string): string {
	const actual = toBlazediffRel(cwd, r.actualPath);
	return actual ? img(actual, `${r.id} actual`) : "-";
}

function diffCell(r: CheckResult, cwd: string): string {
	const diff = toBlazediffRel(cwd, r.diffPath);
	return diff ? img(diff, `${r.id} diff`) : "-";
}

function verdictCell(r: CheckResult): string {
	if (r.status === "missing-baseline") {
		return `missing-baseline - ${r.message ?? "baseline missing"}`;
	}
	if (r.status === "stale-baseline") {
		return `stale-baseline - ${r.message ?? "manifest entry edited without re-capturing"}`;
	}
	if (r.status === "needs-judgment") {
		return `needs-judgment - see judgments/${r.id}/`;
	}
	if (!r.verdict) {
		return r.message ?? r.status;
	}
	return `${r.verdict.label} - ${r.verdict.headline} -> ${r.verdict.action}`;
}

function renderRow(r: CheckResult, cwd: string): string {
	return `| ${r.id} | ${escapeCell(baselineCell(r, cwd))} | ${escapeCell(actualCell(r, cwd))} | ${escapeCell(diffCell(r, cwd))} | ${escapeCell(verdictCell(r))} |`;
}

function headerLine(report: CheckReport): string {
	const { passed, failed, pendingJudgments, totalEntries } = report;
	const parts = [`${passed}/${totalEntries} passed`];
	if (failed > 0) parts.push(`${failed} failed`);
	if (pendingJudgments > 0) parts.push(`${pendingJudgments} pending judgment`);
	return parts.length > 1
		? `${parts[0]} (${parts.slice(1).join(", ")})`
		: parts[0];
}

export function renderSummary(
	report: CheckReport,
	cwd: string = process.cwd(),
): string {
	const nonPass = report.results.filter((r) => r.status !== "pass");
	const lines: string[] = [
		`# blazediff check - ${report.createdAt}`,
		"",
		headerLine(report),
		"",
	];

	if (nonPass.length === 0) {
		lines.push("All entries passed.");
		return `${lines.join("\n")}\n`;
	}

	lines.push("| id | baseline | actual | diff | verdict |");
	lines.push("| --- | --- | --- | --- | --- |");
	for (const r of nonPass) lines.push(renderRow(r, cwd));
	return `${lines.join("\n")}\n`;
}

export async function writeSummaryMarkdown(
	report: CheckReport,
	cwd: string = process.cwd(),
): Promise<string> {
	const file = paths(cwd).summary;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, renderSummary(report, cwd), "utf8");
	return file;
}
