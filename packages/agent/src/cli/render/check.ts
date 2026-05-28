import type { RunEvent } from "../../graph";
import type { CheckReport, CheckResult } from "../../types";
import { bold, dim, pc, statusGlyph } from "./theme";

/** `x/y passed (...)` headline, colored green when all pass, red otherwise. */
export function summaryLine(report: CheckReport): string {
	const { passed, totalEntries, failed, pendingJudgments } = report;
	const head = `${passed}/${totalEntries} passed`;
	const parts: string[] = [];
	if (failed > 0) parts.push(`${failed} failed`);
	if (pendingJudgments > 0) parts.push(`${pendingJudgments} pending judgment`);
	const tail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
	const text = `${head}${tail}`;
	return failed === 0 && pendingJudgments === 0
		? pc.green(bold(text))
		: pc.red(bold(text));
}

/**
 * One live progress line (written to stderr). Pure formatter — no I/O.
 *
 * `captured` returns undefined deliberately: each page also gets a final
 * `result` line, so printing both stacks the page twice. The check progress
 * display is one line per test, owned by the judging → result transition.
 */
export function progressLine(event: RunEvent): string | undefined {
	if (event.type === "result") {
		const r = event.result;
		const detail =
			r.status === "fail" && typeof r.diffPercentage === "number"
				? dim(`  (${r.diffPercentage.toFixed(3)}%)`)
				: r.status !== "pass" && r.message
					? dim(`  (${r.message})`)
					: "";
		return `${statusGlyph(r.status)} ${r.id}${detail}`;
	}
	if (event.type === "judging") {
		return `${pc.cyan("◌")} ${event.entryId}${dim("  (judging…)")}`;
	}
	if (event.type === "interrupt") {
		return `${pc.yellow("?")} ${event.interrupt.entryId}${dim("  (awaiting judgment)")}`;
	}
	return undefined;
}

type FailGroup = {
	signature: string;
	results: CheckResult[];
	verdict?: CheckResult["verdict"];
};

/** Group failing results so identical verdicts collapse into one block. */
function groupFailures(results: CheckResult[]): FailGroup[] {
	const order: string[] = [];
	const groups = new Map<string, FailGroup>();
	for (const r of results) {
		if (r.status === "pass") continue;
		// Entries without a verdict (or needing judgment) never collapse — each
		// carries its own status/message and must stay distinct.
		const signature = r.verdict
			? `v:${r.status}|${r.verdict.label}|${r.verdict.headline}|${r.verdict.action}`
			: `s:${r.id}`;
		let group = groups.get(signature);
		if (!group) {
			group = { signature, results: [], verdict: r.verdict };
			groups.set(signature, group);
			order.push(signature);
		}
		group.results.push(r);
	}
	return order.map((s) => groups.get(s) as FailGroup);
}

function detailFor(r: CheckResult): string {
	if (typeof r.diffPercentage === "number") {
		return `${r.status} (${r.diffPercentage.toFixed(3)}%)`;
	}
	return r.status;
}

/**
 * Compact failure block — one line per verdict group (the headline), one line
 * per verdict-less result (id + status). Per-test diff paths and the verdict
 * label/action are intentionally omitted: the live progress above already shows
 * which tests failed, and `blazediff-agent review` is the way to drill into
 * details. When several groups share results, the ids prefix the headline so
 * the reader can tell which tests belong to which verdict.
 */
export function failureBlock(results: CheckResult[]): string[] {
	const groups = groupFailures(results);
	const verdictGroups = groups.filter((g) => g.verdict);
	const multipleVerdicts = verdictGroups.length > 1;
	const lines: string[] = [];
	for (const group of groups) {
		if (group.verdict) {
			const headline = group.verdict.headline;
			if (multipleVerdicts) {
				const ids = group.results.map((r) => r.id).join(", ");
				lines.push(`${dim(`${ids}:`)} ${headline}`);
			} else {
				lines.push(headline);
			}
			continue;
		}
		// Verdict-less: keep the glyph so missing-baseline / raw-fail visually
		// distinguish from verdict headlines above.
		const r = group.results[0] as CheckResult;
		lines.push(`${statusGlyph(r.status)} ${bold(r.id)}: ${detailFor(r)}`);
		if (r.status === "needs-judgment" && r.message) {
			lines.push(dim(`  ${r.message}`));
		}
	}
	return lines;
}
