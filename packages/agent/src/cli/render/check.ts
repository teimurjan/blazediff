import type { RunEvent } from "../../graph";
import type { CheckReport, CheckResult } from "../../types";
import { bold, dim, pc, relPath, statusGlyph } from "./theme";

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
export function checkSummary(
	report: CheckReport,
	reportPath: string,
	judgmentsPath: string,
): string {
	const summary = summaryLine(report);
	if (report.failed === 0 && report.pendingJudgments === 0) {
		return `${summary}\nreport: ${relPath(reportPath)}`;
	}
	return [
		summary,
		`report: ${relPath(reportPath)}`,
		report.pendingJudgments > 0
			? `pending: ${relPath(judgmentsPath)}/ - host writes <id>/verdict.json, then re-run check --apply-judgments`
			: undefined,
		"run `blazediff-agent review` to review interactively",
	]
		.filter(Boolean)
		.join("\n");
}

function liveResultDetail(
	result: CheckResult,
	awaitingJudgment = false,
): string {
	const details: string[] = [];
	if (result.verdict?.headline) {
		details.push(result.verdict.headline);
	} else if (result.status !== "pass" && result.message) {
		details.push(result.message);
	} else if (
		result.status === "fail" &&
		typeof result.diffPercentage === "number"
	) {
		details.push(`${result.diffPercentage.toFixed(3)}%`);
	}
	if (awaitingJudgment) details.push("awaiting judgment");
	return details.join(" · ");
}

/**
 * One live progress line written to stderr.
 *
 * A page keeps one row as it moves through capture, comparison, judgment, and
 * its terminal result. The capture-complete event is a phase summary.
 */
export function progressLine(event: RunEvent): string | undefined {
	if (event.type === "capturing") {
		return `${pc.cyan("◌")} ${event.entryId}${dim("  (capturing…)")}`;
	}
	if (event.type === "captured") {
		return `${pc.green("✓")} ${event.entryId}${dim("  (captured)")}`;
	}
	if (event.type === "capture-complete") {
		const count =
			event.captured === event.total
				? `${event.captured} screenshot${event.captured === 1 ? "" : "s"}`
				: `${event.captured}/${event.total} screenshots`;
		return `${pc.green("✓")} capture complete${dim(`  (${count})`)}`;
	}
	if (event.type === "diffing") {
		return `${pc.cyan("◌")} ${event.entryId}${dim("  (comparing…)")}`;
	}
	if (event.type === "result") {
		const detailText = liveResultDetail(event.result);
		const detail = detailText ? dim(`  (${detailText})`) : "";
		return `${statusGlyph(event.result.status)} ${event.result.id}${detail}`;
	}
	if (event.type === "judging") {
		return `${pc.cyan("◌")} ${event.entryId}${dim("  (judging…)")}`;
	}
	if (event.type === "interrupt") {
		const pending = event.interrupt.pendingResult;
		const detail = liveResultDetail(pending, true);
		return `${pc.yellow("?")} ${event.interrupt.entryId}${detail ? dim(`  (${detail})`) : ""}`;
	}
	return undefined;
}
