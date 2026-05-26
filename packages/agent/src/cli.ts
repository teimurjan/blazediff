import { Command } from "commander";
import pkgJson from "../package.json";
import { closeBrowser } from "./browser/launch";
import { registerAuth } from "./cli/commands/auth";
import { registerBrowsers } from "./cli/commands/browsers";
import { registerCapture } from "./cli/commands/capture";
import { registerCheck } from "./cli/commands/check";
import { registerDiff } from "./cli/commands/diff";
import { registerDiscover } from "./cli/commands/discover";
import { registerInit } from "./cli/commands/init";
import { registerManifest } from "./cli/commands/manifest";
import { registerOnboard } from "./cli/commands/onboard";
import { registerReset } from "./cli/commands/reset";
import { registerRewrite } from "./cli/commands/rewrite";
import { registerServeStatus } from "./cli/commands/serve-status";
import { applyCwdFromArgv, maybeDefaultToCheck } from "./cli/cwd";
import { makeOutput, type RootOpts } from "./cli/output";
import { loadEnvFiles } from "./dotenv";

function buildProgram(): Command {
	const program = new Command()
		.name("blazediff-agent")
		.description("Agentic visual regression for BlazeDiff")
		.version(pkgJson.version)
		.option("-C, --cwd <path>", "operate on a different directory")
		.option("--json", "emit JSON to stdout where applicable")
		.option("--quiet", "suppress non-error output");

	const out = makeOutput(() => program.opts() as RootOpts);

	registerOnboard(program, out);
	registerInit(program, out);
	registerDiscover(program, out);
	registerServeStatus(program, out);
	registerCapture(program, out);
	registerBrowsers(program, out);
	registerDiff(program, out);
	registerManifest(program, out);
	registerAuth(program, out);
	registerCheck(program, out);
	registerRewrite(program, out);
	registerReset(program, out);

	return program;
}

async function main(): Promise<void> {
	try {
		applyCwdFromArgv();
	} catch (err) {
		process.stderr.write(`${(err as Error).message}\n`);
		process.exitCode = 1;
		return;
	}

	// cwd is now the target dir; load its .env so harnesses see secrets.
	loadEnvFiles();

	maybeDefaultToCheck();
	const program = buildProgram();

	try {
		await program.parseAsync();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const json = Boolean(program.opts().json);
		if (json) {
			process.stdout.write(
				`${JSON.stringify({ ok: false, error: message })}\n`,
			);
		} else {
			process.stderr.write(`error: ${message}\n`);
		}
		process.exitCode = 1;
	} finally {
		await closeBrowser();
	}
}

void main();
