import type { Command } from "commander";
import { DEFAULT_REVIEW_PORT } from "../../defaults";
import { paths } from "../../paths";
import { readReport } from "../../report/json";
import { startReviewServer } from "../../review/server";
import type { Output } from "../output";
import { parsePort } from "../parsers";

interface Opts {
	port: string;
	host: string;
	open: boolean;
}

export function registerReview(program: Command, out: Output): void {
	program
		.command("review")
		.description(
			"review visual-regression diffs in a local webapp (approve/reject)",
		)
		.option("--port <n>", "port to serve on", String(DEFAULT_REVIEW_PORT))
		.option("--host <host>", "host to bind", "127.0.0.1")
		.option("--no-open", "do not open the browser")
		.action(async (opts: Opts) => {
			const report = await readReport();
			if (!report) {
				throw new Error(
					`no ${paths().report}. Run \`blazediff-agent check\` first.`,
				);
			}

			const handle = await startReviewServer({
				cwd: process.cwd(),
				port: parsePort(opts.port),
				host: opts.host,
				open: opts.open !== false && !out.isJson(),
			});

			out.emit(
				{ ok: true, url: handle.url, port: handle.port },
				`review server up on ${handle.url} (ctrl-c to stop)`,
			);

			// Stay alive until SIGINT/SIGTERM (handled inside the server).
			await new Promise<never>(() => {});
		});
}
