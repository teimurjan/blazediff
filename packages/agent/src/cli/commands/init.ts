import type { Command } from "commander";
import { configHash, loadConfig, saveConfig } from "../../config";
import { DEFAULT_PORT, DEFAULT_READY_TIMEOUT_MS } from "../../defaults";
import { detectFramework } from "../../introspect/framework";
import { introspectPackage } from "../../introspect/package";
import { paths } from "../../paths";
import type { AgentConfig } from "../../types";
import { ensureGitignore } from "../gitignore";
import type { Output } from "../output";
import { parsePort } from "../parsers";

interface Opts {
	force?: boolean;
	url?: string;
	devCommand?: string;
	port?: string;
	devScript?: string;
}

async function buildConfig(opts: Opts): Promise<AgentConfig> {
	if (opts.url) {
		if (opts.devCommand || opts.port || opts.devScript) {
			throw new Error(
				"--url is mutually exclusive with --dev-command/--port/--dev-script",
			);
		}
		const baseUrl = new URL(opts.url).toString().replace(/\/$/, "");
		return { devServer: null, baseUrl };
	}

	if (opts.devCommand) {
		const port = opts.port ? parsePort(opts.port) : DEFAULT_PORT;
		return {
			devServer: {
				command: opts.devCommand,
				port,
				readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
			},
			baseUrl: `http://127.0.0.1:${port}`,
		};
	}

	const pkg = await introspectPackage();
	if (!pkg) {
		throw new Error(
			"no package.json with a dev/start script in cwd. Pass --url <baseUrl> or --dev-command <cmd>.",
		);
	}

	let chosen = pkg.candidates[0];
	if (pkg.candidates.length > 1) {
		if (!opts.devScript) {
			const names = pkg.candidates
				.map((c) => `${c.name} (${c.command})`)
				.join(", ");
			throw new Error(
				`multiple dev-script candidates: ${names}. Pass --dev-script <name> or --dev-command <cmd>.`,
			);
		}
		const match = pkg.candidates.find((c) => c.name === opts.devScript);
		if (!match) {
			const names = pkg.candidates.map((c) => c.name).join(", ");
			throw new Error(
				`--dev-script "${opts.devScript}" not found among candidates: ${names}`,
			);
		}
		chosen = match;
	}

	const port = opts.port ? parsePort(opts.port) : chosen.port;
	return {
		devServer: {
			command: chosen.command,
			port,
			readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
		},
		framework: detectFramework(pkg),
		packageManager: pkg.packageManager,
		baseUrl: `http://127.0.0.1:${port}`,
	};
}

export function registerInit(program: Command, out: Output): void {
	program
		.command("init")
		.description("write .blazediff/config.json and .gitignore")
		.option("--force", "overwrite existing config")
		.option(
			"--url <baseUrl>",
			"point at an already-running server / external URL",
		)
		.option("--dev-command <cmd>", "override detected dev-server command")
		.option("--port <n>", "override detected port")
		.option(
			"--dev-script <name>",
			"select a dev script by name when multiple candidates exist",
		)
		.action(async (opts: Opts) => {
			const existing = await loadConfig();
			if (existing && !opts.force) {
				await ensureGitignore(process.cwd());
				out.emit(
					{
						ok: true,
						created: false,
						config: existing,
						configHash: configHash(existing),
					},
					`config exists at ${paths().config} (use --force to overwrite)`,
				);
				return;
			}

			const built = await buildConfig(opts);
			// preserve a judge backend chosen via `onboard --stack` across re-init
			const config: AgentConfig = existing?.judge
				? { ...built, judge: existing.judge }
				: built;
			await saveConfig(config);
			await ensureGitignore(process.cwd());

			const human = config.devServer
				? `wrote ${paths().config}\n  baseUrl: ${config.baseUrl}\n  dev: ${config.devServer.command} (port ${config.devServer.port})`
				: `wrote ${paths().config}\n  baseUrl: ${config.baseUrl}\n  external server (no devServer managed)`;
			out.emit(
				{ ok: true, created: true, config, configHash: configHash(config) },
				human,
			);
		});
}
