import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class CodegenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CodegenError";
	}
}

export interface RunCodegenOptions {
	loginUrl: string;
	cwd?: string;
	command?: string;
	args?: string[];
	stdio?: "inherit" | "ignore";
}

export interface RunCodegenResult {
	rawSource: string;
	scriptPath: string;
}

export async function runCodegen(
	opts: RunCodegenOptions,
): Promise<RunCodegenResult> {
	const tmp = await mkdtemp(path.join(tmpdir(), "blazediff-codegen-"));
	const scriptPath = path.join(tmp, "recording.js");

	const command = opts.command ?? "npx";
	const args = opts.args ?? [
		"playwright",
		"codegen",
		"--target=javascript",
		`--output=${scriptPath}`,
		opts.loginUrl,
	];

	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: opts.cwd ?? process.cwd(),
			stdio: opts.stdio ?? "inherit",
		});
		child.on("error", (err) => {
			reject(
				new CodegenError(
					`failed to spawn \`${command} ${args.join(" ")}\`: ${err.message}. Ensure Playwright is installed (\`npx playwright install\`).`,
				),
			);
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new CodegenError(
					`playwright codegen exited with code ${code}. Re-run after fixing the recording.`,
				),
			);
		});
	});

	let rawSource: string;
	try {
		rawSource = await readFile(scriptPath, "utf8");
	} catch (err) {
		await rm(tmp, { recursive: true, force: true }).catch(() => {});
		throw new CodegenError(
			`codegen did not write to ${scriptPath}: ${(err as Error).message}`,
		);
	}

	if (!rawSource.trim()) {
		await rm(tmp, { recursive: true, force: true }).catch(() => {});
		throw new CodegenError(
			"codegen output is empty. Re-run and complete the login flow before closing the recorder.",
		);
	}

	return { rawSource, scriptPath };
}
