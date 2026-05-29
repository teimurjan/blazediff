import { ensureGitignore } from "../cli/gitignore";
import type { Output } from "../cli/output";
import { parsePort } from "../cli/parsers";
import { promptChoice } from "../cli/prompt";
import { configHash, loadConfig, saveConfig } from "../config";
import { DEFAULT_PORT, DEFAULT_READY_TIMEOUT_MS } from "../defaults";
import { detectFramework } from "../introspect/framework";
import {
	type DevScriptCandidate,
	introspectPackage,
} from "../introspect/package";
import { paths } from "../paths";
import type { AgentConfig } from "../types";

export interface ConfigOpts {
	url?: string;
	devCommand?: string;
	port?: string;
	devScript?: string;
}

export const NO_DEV_SCRIPT_ERROR =
	"no package.json with a dev/start script in cwd. Pass --url <baseUrl> or --dev-command <cmd>.";

/**
 * Resolve which dev script to run when a package.json exposes several
 * (`dev`, `start`, …). `--dev-script` wins; otherwise prompt when interactive,
 * else fall back to the highest-priority candidate (`dev` > `start` > …) —
 * candidates already arrive in that order from introspectPackage.
 */
export async function chooseDevScript(
	candidates: DevScriptCandidate[],
	opts: ConfigOpts,
	interactive: boolean,
): Promise<DevScriptCandidate> {
	if (candidates.length === 1) return candidates[0];

	if (opts.devScript) {
		const match = candidates.find((c) => c.name === opts.devScript);
		if (!match) {
			const names = candidates.map((c) => c.name).join(", ");
			throw new Error(
				`--dev-script "${opts.devScript}" not found among candidates: ${names}`,
			);
		}
		return match;
	}

	if (interactive) {
		return promptChoice(
			"Multiple dev scripts found. Which one starts your app?",
			candidates.map((c) => ({
				label: c.name,
				value: c,
				hint: `(${c.command})`,
			})),
		);
	}

	const chosen = candidates[0];
	process.stderr.write(
		`picked dev script "${chosen.name}" (${chosen.command}); override with --dev-script <name>\n`,
	);
	return chosen;
}

/** Build a fresh AgentConfig from flags + package.json introspection. */
export async function buildConfig(
	opts: ConfigOpts,
	{ interactive }: { interactive: boolean },
): Promise<AgentConfig> {
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
		throw new Error(NO_DEV_SCRIPT_ERROR);
	}

	const chosen = await chooseDevScript(pkg.candidates, opts, interactive);
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

export interface EnsureConfigResult {
	config: AgentConfig;
	created: boolean;
}

/**
 * Load the existing config or build+write a new one. Preserves a judge backend
 * chosen via a previous onboard. Always ensures `.gitignore`. `force` rewrites.
 */
export async function ensureConfig(
	opts: ConfigOpts & { force?: boolean },
	out: Output,
): Promise<EnsureConfigResult> {
	const existing = await loadConfig();
	if (existing && !opts.force) {
		await ensureGitignore(process.cwd());
		return { config: existing, created: false };
	}

	const built = await buildConfig(opts, {
		interactive: out.isTTY() && !out.isJson(),
	});
	const config: AgentConfig = existing?.judge
		? { ...built, judge: existing.judge }
		: built;
	await saveConfig(config);
	await ensureGitignore(process.cwd());
	return { config, created: true };
}

export function configSummary(config: AgentConfig): string {
	return config.devServer
		? `${paths().config} (baseUrl ${config.baseUrl}, dev: ${config.devServer.command} :${config.devServer.port})`
		: `${paths().config} (external baseUrl ${config.baseUrl})`;
}

export { configHash };
