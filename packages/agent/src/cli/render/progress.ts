import type { RunEvent } from "../../graph";
import { progressLine } from "./check";

export interface Progress {
	emit(event: RunEvent): void;
}

/**
 * Live progress view for `blazediff-agent check`.
 *
 * TTY output owns one transient line. In-flight events replace that line with
 * carriage return plus erase-line, while terminal results are printed once.
 * This avoids cursor-up redraws, which become an unbounded log in terminals
 * that capture output without emulating a full screen.
 *
 * Non-TTY output announces each phase once and prints terminal results.
 */
export function createProgress(opts?: { interactive?: boolean }): Progress {
	const interactive = opts?.interactive ?? Boolean(process.stderr.isTTY);
	const announcedPhases = new Set<"capturing" | "diffing" | "judging">();
	const completed = new Set<string>();
	let liveLineVisible = false;

	function terminalKey(event: RunEvent): string | undefined {
		if (event.type === "result") return event.result.id;
		if (event.type === "interrupt") return event.interrupt.entryId;
		return undefined;
	}

	function writePermanent(event: RunEvent): void {
		const key = terminalKey(event);
		if (key && completed.has(key)) return;
		const line = progressLine(event);
		if (!line) return;
		if (key) completed.add(key);
		process.stderr.write(`${line}\n`);
	}

	function appendOnly(event: RunEvent): void {
		if (
			event.type === "capturing" ||
			event.type === "diffing" ||
			event.type === "judging"
		) {
			if (announcedPhases.has(event.type)) return;
			announcedPhases.add(event.type);
			writePermanent(event);
			return;
		}
		if (
			event.type === "capture-complete" ||
			event.type === "result" ||
			event.type === "interrupt"
		) {
			writePermanent(event);
		}
	}

	function clearLive(): void {
		if (!liveLineVisible) return;
		process.stderr.write("\r\x1b[2K");
		liveLineVisible = false;
	}

	function replaceLive(event: RunEvent): void {
		const line = progressLine(event);
		if (!line) return;
		process.stderr.write(`\r\x1b[2K${line}`);
		liveLineVisible = true;
	}

	function interactiveEvent(event: RunEvent): void {
		if (event.type === "report") {
			clearLive();
			return;
		}
		if (
			event.type === "result" ||
			event.type === "interrupt" ||
			event.type === "capture-complete"
		) {
			clearLive();
			writePermanent(event);
			return;
		}
		if (
			event.type === "capturing" ||
			event.type === "captured" ||
			event.type === "diffing" ||
			event.type === "judging"
		) {
			replaceLive(event);
		}
	}

	function emit(event: RunEvent): void {
		if (interactive) {
			interactiveEvent(event);
			return;
		}
		if (event.type !== "report") appendOnly(event);
	}

	return { emit };
}
