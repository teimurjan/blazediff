import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export interface BrowsersInstallOptions {
	check?: boolean;
}

export interface BrowsersInstallResult {
	installed: boolean;
	executablePath: string | null;
	cliPath: string;
}

export function resolvePlaywrightCli(): string {
	const require_ = createRequire(import.meta.url);
	// playwright exposes its CLI at lib/cli or cli.js; resolve via its package.json then locate.
	const pkgJson = require_.resolve("playwright/package.json");
	const dir = path.dirname(pkgJson);
	const candidates = [
		path.join(dir, "cli.js"),
		path.join(dir, "lib", "cli.js"),
	];
	const found = candidates.find((p) => existsSync(p));
	if (!found) {
		throw new Error(`could not locate playwright CLI under ${dir}`);
	}
	return found;
}

async function readExecutablePath(): Promise<string | null> {
	try {
		const require_ = createRequire(import.meta.url);
		const pw = require_("playwright") as {
			chromium: { executablePath(): string };
		};
		const p = pw.chromium.executablePath();
		return p && existsSync(p) ? p : null;
	} catch {
		return null;
	}
}

export async function installBrowsers(
	opts: BrowsersInstallOptions = {},
): Promise<BrowsersInstallResult> {
	const cliPath = resolvePlaywrightCli();
	if (opts.check) {
		const executablePath = await readExecutablePath();
		return { installed: Boolean(executablePath), executablePath, cliPath };
	}

	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [cliPath, "install", "chromium"], {
			stdio: ["ignore", "inherit", "inherit"],
			env: process.env,
		});
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else
				reject(
					new Error(`playwright install chromium exited with code ${code}`),
				);
		});
		child.on("error", reject);
	});

	const executablePath = await readExecutablePath();
	return { installed: Boolean(executablePath), executablePath, cliPath };
}
