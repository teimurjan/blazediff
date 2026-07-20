import type { Output } from "../output";
import { bold, dim, pc, relPath } from "./theme";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERACTIVE_REFRESH_MS = 80;
const NON_INTERACTIVE_HEARTBEAT_MS = 10_000;

export interface DevServerProgress {
	checking(): void;
	starting(): void;
	ready(attached: boolean): void;
	failed(): void;
}

export interface DevServerProgressOptions {
	command: string;
	port: number;
	logPath: string;
	interactive?: boolean;
}

type Phase = "idle" | "checking" | "starting" | "ready" | "failed";

export function createDevServerProgress(
	out: Output,
	opts: DevServerProgressOptions,
): DevServerProgress {
	if (out.isQuiet() || out.isJson()) {
		return {
			checking() {},
			starting() {},
			ready() {},
			failed() {},
		};
	}

	const interactive = opts.interactive ?? out.isTTY();
	const url = `http://127.0.0.1:${opts.port}`;
	const startedAt = Date.now();
	let phase: Phase = "idle";
	let frame = 0;
	let timer: NodeJS.Timeout | undefined;

	const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
	const stopTimer = () => {
		if (!timer) return;
		clearInterval(timer);
		timer = undefined;
	};
	const interactiveLine = () => {
		const spinner = pc.cyan(SPINNER_FRAMES[frame]);
		if (phase === "checking") {
			return `  ${spinner} checking dev server ${dim(url)} ${dim(`· ${elapsed()}`)}`;
		}
		return `  ${spinner} starting dev server ${dim(url)} ${dim(`· ${elapsed()}`)}`;
	};
	const drawInteractive = () => {
		process.stderr.write(`\r${interactiveLine()}\x1b[K`);
	};
	const startInteractiveTimer = () => {
		if (timer) return;
		timer = setInterval(() => {
			frame = (frame + 1) % SPINNER_FRAMES.length;
			drawInteractive();
		}, INTERACTIVE_REFRESH_MS);
		timer.unref();
	};

	return {
		checking() {
			if (phase !== "idle") return;
			phase = "checking";
			if (interactive) {
				drawInteractive();
				startInteractiveTimer();
				return;
			}
			process.stderr.write(
				`${dim("[blazediff]")} checking dev server ${dim(url)}\n`,
			);
		},
		starting() {
			if (phase === "ready" || phase === "failed") return;
			phase = "starting";
			if (interactive) {
				drawInteractive();
				return;
			}
			process.stderr.write(
				`${dim("[blazediff]")} starting dev server\n  command: ${bold(opts.command)}\n  waiting: ${url}\n  logs: ${relPath(opts.logPath)}\n`,
			);
			timer = setInterval(() => {
				process.stderr.write(
					`  dev server: still starting ${dim(`· ${elapsed()}`)} ${dim(`· logs: ${relPath(opts.logPath)}`)}\n`,
				);
			}, NON_INTERACTIVE_HEARTBEAT_MS);
			timer.unref();
		},
		ready(attached: boolean) {
			if (phase === "ready" || phase === "failed") return;
			phase = "ready";
			stopTimer();
			const state = attached ? "already running" : "ready";
			const logs = attached ? "" : dim(` · logs: ${relPath(opts.logPath)}`);
			const line = `${pc.green("✓")} dev server ${state} ${dim(url)} ${dim(`· ${elapsed()}`)}${logs}`;
			process.stderr.write(interactive ? `\r${line}\x1b[K\n` : `${line}\n`);
		},
		failed() {
			if (phase === "ready" || phase === "failed") return;
			phase = "failed";
			stopTimer();
			const line = `${pc.red("✗")} dev server failed ${dim(`· logs: ${relPath(opts.logPath)}`)}`;
			process.stderr.write(interactive ? `\r${line}\x1b[K\n` : `${line}\n`);
		},
	};
}
