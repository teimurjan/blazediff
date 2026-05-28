import type { RunEvent } from "../../graph";
import { progressLine } from "./check";

type RowEvent = Extract<RunEvent, { type: "judging" | "result" | "interrupt" }>;

export interface Progress {
	emit(event: RunEvent): void;
}

/**
 * Live progress view for `blazediff-agent check`.
 *
 * On a TTY, keeps one row per test below the captured / warmup output and
 * redraws the region on each event so a "judging" row updates in place into
 * its final result, instead of stacking a new line for the completion. On
 * non-TTY output (pipes, CI logs) falls back to plain append-only writes so
 * the log artifacts stay free of ANSI escapes.
 */
export function createProgress(opts?: { interactive?: boolean }): Progress {
	const interactive = opts?.interactive ?? Boolean(process.stderr.isTTY);
	const rows = new Map<string, RowEvent>();
	const order: string[] = [];
	let linesDrawn = 0;

	/**
	 * Non-TTY: append-only writes. We can't redraw without ANSI, so the
	 * intermediate "judging" line for a test would just stack above its result
	 * line — two log entries per test. Suppress `judging` here so each test
	 * contributes exactly one line (its terminal `result` / `interrupt`); the
	 * `captured` phase still prints its own line above the judging block.
	 */
	function appendOnly(event: RunEvent): void {
		if (event.type === "judging") return;
		const line = progressLine(event);
		if (line) process.stderr.write(`${line}\n`);
	}

	function rowKey(event: RowEvent): string {
		if (event.type === "judging") return event.entryId;
		if (event.type === "result") return event.result.id;
		return event.interrupt.entryId;
	}

	function upsert(key: string, event: RowEvent): void {
		if (!rows.has(key)) order.push(key);
		rows.set(key, event);
	}

	function clearLive(): void {
		if (linesDrawn === 0) return;
		// \x1b[NF: cursor up N lines, column 0. \x1b[J: clear to end of screen.
		process.stderr.write(`\x1b[${linesDrawn}F\x1b[J`);
		linesDrawn = 0;
	}

	function draw(): void {
		for (const key of order) {
			const row = rows.get(key);
			if (!row) continue;
			const line = progressLine(row);
			if (line) process.stderr.write(`${line}\n`);
		}
		linesDrawn = order.length;
	}

	function redrawing(event: RunEvent): void {
		// `captured` is intentionally not rendered: the final result line for the
		// same page would otherwise show twice (once during capture phase, once
		// after judging). See progressLine for the same reason on the formatter
		// side.
		if (
			event.type !== "judging" &&
			event.type !== "result" &&
			event.type !== "interrupt"
		) {
			return;
		}
		upsert(rowKey(event), event);
		clearLive();
		draw();
	}

	function emit(event: RunEvent): void {
		if (event.type === "report") return;
		if (!interactive) {
			appendOnly(event);
			return;
		}
		redrawing(event);
	}

	return { emit };
}
