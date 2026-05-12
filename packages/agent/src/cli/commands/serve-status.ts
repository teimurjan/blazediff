import type { Command } from "commander";
import { loadConfig } from "../../config";
import { DEFAULT_READY_TIMEOUT_MS } from "../../defaults";
import { isPortOpen, startServer, stopServer } from "../../server/lifecycle";
import type { Output } from "../output";

interface Opts {
	start?: boolean;
	detach?: boolean;
	kill?: boolean;
	port?: string;
}

export function registerServeStatus(program: Command, out: Output): void {
	program
		.command("serve-status")
		.description("start/stop the configured dev server")
		.option("--start", "start (default)")
		.option(
			"--detach",
			"alias for --start; waits up to readyTimeoutMs for the port",
		)
		.option("--kill", "stop the dev server")
		.option("--port <n>", "override port from config")
		.action(async (opts: Opts) => {
			const config = await loadConfig();
			if (!config) {
				throw new Error(
					"no .blazediff/config.json. Run `blazediff-agent init` first.",
				);
			}
			if (!config.devServer) {
				out.emit(
					{ ok: true, external: true, baseUrl: config.baseUrl },
					`external base URL (${config.baseUrl}); no dev server managed`,
				);
				return;
			}

			const port = opts.port ? Number(opts.port) : config.devServer.port;

			if (opts.kill) {
				const result = await stopServer(process.cwd(), port);
				const human = result.killed
					? `dev server stopped (pid ${result.pid} via ${result.via})`
					: `no dev server found to stop on :${port}`;
				out.emit({ ok: true, stopped: result.killed, ...result }, human);
				return;
			}

			if (await isPortOpen(port)) {
				out.emit(
					{ ok: true, attached: true, port },
					`dev server already up on :${port}`,
				);
				return;
			}

			const handle = await startServer({
				command: config.devServer.command,
				port,
				readyTimeoutMs:
					config.devServer.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
			});
			out.emit(
				{ ok: true, ...handle },
				`dev server up on :${handle.port} (pid ${handle.pid})`,
			);
		});
}
