import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { Command } from "commander";
import { loadConfig } from "../../config";
import { paths } from "../../paths";
import { stopServer } from "../../server/lifecycle";
import type { Output } from "../output";

interface Opts {
	yes?: boolean;
}

interface StopOutcome {
	stopped: boolean;
	via?: string;
	pid?: number | null;
}

async function stopTrackedServer(): Promise<StopOutcome> {
	const config = await loadConfig();
	if (!config?.devServer) return { stopped: false };
	try {
		const result = await stopServer(process.cwd(), config.devServer.port);
		return { stopped: result.killed, via: result.via, pid: result.pid };
	} catch {
		return { stopped: false };
	}
}

export function registerReset(program: Command, out: Output): void {
	program
		.command("reset")
		.description(
			"wipe .blazediff/ entirely - config, manifest, baselines, actual, judgments, summary, pid/log (stops the dev server first if one is tracked). Re-run /blazediff or `onboard` afterward to start from scratch.",
		)
		.option("--yes", "do not prompt; required when stdin is a TTY")
		.action(async (opts: Opts) => {
			const root = paths().root;
			if (!existsSync(root)) {
				out.emit(
					{ ok: true, removed: false, root },
					`nothing to reset (no ${root})`,
				);
				return;
			}
			if (out.isTTY() && !opts.yes && !out.isJson()) {
				throw new Error(
					`refusing to wipe ${root} without --yes (interactive run)`,
				);
			}

			const stopOutcome = await stopTrackedServer();
			await rm(root, { recursive: true, force: true });

			out.emit(
				{ ok: true, removed: true, root, devServer: stopOutcome },
				stopOutcome.stopped
					? `stopped dev server (pid ${stopOutcome.pid} via ${stopOutcome.via}) and removed ${root}`
					: `removed ${root}`,
			);
		});
}
