import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { runCodegen } from "../../auth/codegen";
import { DEFAULT_PERSONA, envVarsForPersona } from "../../auth/env";
import { postprocessCodegen } from "../../auth/postprocess";
import { loadConfig } from "../../config";
import { paths } from "../../paths";
import type { AgentConfig } from "../../types";
import type { Output } from "../output";

interface InitOpts {
	persona: string;
	loginUrl?: string;
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

function resolveLoginUrl(opts: InitOpts, config: AgentConfig | null): string {
	if (opts.loginUrl) return opts.loginUrl;
	const baseUrl = config?.baseUrl;
	if (!baseUrl) {
		throw new Error(
			"no login URL: pass --login-url <url> or run `blazediff-agent init` first.",
		);
	}
	return new URL("/login", baseUrl).toString();
}

export function registerAuth(program: Command, out: Output): void {
	const cmd = program
		.command("auth")
		.description("manage auth harnesses for protected routes");

	cmd
		.command("init")
		.description(
			"record an interactive login via playwright codegen and write a login harness to .blazediff/harnesses/auth.js",
		)
		.option("--persona <name>", "persona name", DEFAULT_PERSONA)
		.option("--login-url <url>", "URL of the login form")
		.option("--allow-production", "skip the non-prod URL guard")
		.option("--force", "overwrite an existing .blazediff/harnesses/auth.js")
		.option(
			"--output <path>",
			"override the harness output path (default: .blazediff/harnesses/auth.js)",
		)
		.action(async (opts: InitOpts) => {
			const config = await loadConfig();
			const loginUrl = resolveLoginUrl(opts, config);

			if (looksLikeProduction(loginUrl) && !opts.allowProduction) {
				throw new Error(
					`refusing to record against what looks like a production URL: ${loginUrl}. Pass --allow-production to override.`,
				);
			}

			const harnessPath = opts.output
				? path.isAbsolute(opts.output)
					? opts.output
					: path.join(process.cwd(), opts.output)
				: paths().authHarness;

			if (existsSync(harnessPath) && !opts.force) {
				throw new Error(`refusing to overwrite ${harnessPath} (use --force).`);
			}

			process.stderr.write(
				`recording login flow at ${loginUrl} via playwright codegen...\n` +
					"  log in, then close the recorder window. Credentials you type will be rewritten to env vars before saving.\n",
			);

			let rawSource: string;
			let scriptPath: string;
			try {
				const result = await runCodegen({ loginUrl });
				rawSource = result.rawSource;
				scriptPath = result.scriptPath;
			} catch (err) {
				throw new Error(`codegen failed: ${(err as Error).message}`);
			}

			const processed = postprocessCodegen(rawSource, {
				persona: opts.persona,
				loginUrl,
			});

			await mkdir(path.dirname(harnessPath), { recursive: true });
			await writeFile(harnessPath, processed.source, "utf8");

			await rm(path.dirname(scriptPath), {
				recursive: true,
				force: true,
			}).catch(() => {});

			const harnessRelative =
				path.relative(process.cwd(), harnessPath) || "harnesses/auth.js";
			const harnessName = path.basename(harnessPath).replace(/\.[^.]+$/, "");

			const { email, password } = envVarsForPersona(opts.persona);
			for (const w of processed.warnings) {
				process.stderr.write(`  warning: ${w}\n`);
			}
			const human = [
				`wrote ${harnessPath}`,
				`  persona: ${opts.persona}`,
				`  loginUrl: ${loginUrl}`,
				`  set ${email} and ${password} in your environment or .blazediff/.env (auto-loaded + gitignored)`,
				`  attach it to an entry, e.g. harnesses: [{ "name": "${harnessName}", "params": { "persona": "${opts.persona}" } }]`,
			].join("\n");

			out.emit(
				{
					ok: true,
					harness: harnessRelative,
					harnessName,
					loginUrl,
					persona: opts.persona,
					envVars: { email, password },
					warnings: processed.warnings,
				},
				human,
			);
		});
}
