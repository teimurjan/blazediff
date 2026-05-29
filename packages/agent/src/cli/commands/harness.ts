import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../../config";
import { runCodegen } from "../../harness/codegen";
import {
	buildHarness,
	buildLoginHarness,
	DEFAULT_PERSONA,
	envVarsForPersona,
} from "../../harness/template";
import { paths } from "../../paths";
import type { AgentConfig } from "../../types";
import type { Output } from "../output";
import { bold, dim, relPath } from "../render/theme";

interface RecordOpts {
	url?: string;
	phase?: string;
	login?: boolean;
	persona: string;
	allowProduction?: boolean;
	force?: boolean;
	output?: string;
}

function looksLikeProduction(url: string): boolean {
	try {
		const u = new URL(url);
		const host = u.hostname;
		if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
			return false;
		}
		if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** Codegen target: explicit `--url`, else config baseUrl (login adds `/login`). */
function resolveUrl(opts: RecordOpts, config: AgentConfig | null): string {
	if (opts.url) return opts.url;
	const baseUrl = config?.baseUrl;
	if (!baseUrl) {
		throw new Error(
			"no recording URL: pass --url <url> or run `blazediff-agent onboard` first.",
		);
	}
	return opts.login ? new URL("/login", baseUrl).toString() : baseUrl;
}

function parsePhase(opts: RecordOpts): "setup" | "interact" {
	if (opts.phase) {
		if (opts.phase !== "setup" && opts.phase !== "interact") {
			throw new Error(
				`unknown --phase: ${opts.phase} (expected: setup | interact)`,
			);
		}
		return opts.phase;
	}
	return opts.login ? "setup" : "interact";
}

export function registerHarness(program: Command, out: Output): void {
	const cmd = program
		.command("harness")
		.description("author harnesses for protected or interactive routes");

	cmd
		.command("record <name>")
		.description(
			"record an interaction via playwright codegen and write a harness to .blazediff/harnesses/<name>.js. Use --login to rewrite typed credentials to env-var refs.",
		)
		.option("--url <url>", "page to open the recorder against")
		.option("--phase <phase>", "harness phase: setup | interact")
		.option("--login", "treat as a login flow: rewrite credentials to env refs")
		.option("--persona <name>", "persona name (login only)", DEFAULT_PERSONA)
		.option("--allow-production", "skip the non-prod URL guard")
		.option("--force", "overwrite an existing harness file")
		.option(
			"--output <path>",
			"override the harness output path (default: .blazediff/harnesses/<name>.js)",
		)
		.action(async (name: string, opts: RecordOpts) => {
			const config = await loadConfig();
			const url = resolveUrl(opts, config);
			const phase = parsePhase(opts);

			if (looksLikeProduction(url) && !opts.allowProduction) {
				throw new Error(
					`refusing to record against what looks like a production URL: ${url}. Pass --allow-production to override.`,
				);
			}

			const harnessPath = opts.output
				? path.isAbsolute(opts.output)
					? opts.output
					: path.join(process.cwd(), opts.output)
				: path.join(paths().harnesses, `${name}.js`);

			if (existsSync(harnessPath) && !opts.force) {
				throw new Error(`refusing to overwrite ${harnessPath} (use --force).`);
			}

			process.stderr.write(
				`recording ${opts.login ? "login " : ""}flow at ${url} via playwright codegen...\n` +
					`  drive the flow, then close the recorder window.${opts.login ? " Credentials you type will be rewritten to env vars before saving." : ""}\n`,
			);

			let rawSource: string;
			let scriptPath: string;
			try {
				const result = await runCodegen({ url });
				rawSource = result.rawSource;
				scriptPath = result.scriptPath;
			} catch (err) {
				throw new Error(`codegen failed: ${(err as Error).message}`);
			}

			const built = opts.login
				? buildLoginHarness(rawSource, {
						name,
						loginUrl: url,
						persona: opts.persona,
					})
				: buildHarness(rawSource, { name, url, phase });

			await mkdir(path.dirname(harnessPath), { recursive: true });
			await writeFile(harnessPath, built.source, "utf8");

			await rm(path.dirname(scriptPath), {
				recursive: true,
				force: true,
			}).catch(() => {});

			for (const w of built.warnings) {
				process.stderr.write(`  ${dim("warning:")} ${w}\n`);
			}

			const harnessRelative = relPath(harnessPath);
			const lines = [
				`wrote ${bold(harnessRelative)}`,
				`  phase: ${phase}`,
				`  url: ${url}`,
			];
			const payload: Record<string, unknown> = {
				ok: true,
				harness: harnessRelative,
				harnessName: name,
				phase,
				url,
				warnings: built.warnings,
			};

			if (opts.login) {
				const { email, password } = envVarsForPersona(opts.persona);
				lines.push(
					`  persona: ${opts.persona}`,
					`  set ${email} and ${password} in your environment or .blazediff/.env (auto-loaded + gitignored)`,
					`  attach it: harnesses: [{ "name": "${name}", "params": { "persona": "${opts.persona}" } }]`,
				);
				payload.persona = opts.persona;
				payload.envVars = { email, password };
			} else {
				lines.push(`  attach it: harnesses: [{ "name": "${name}" }]`);
			}

			out.emit(payload, lines.join("\n"));
		});
}
