import { existsSync } from "node:fs";
import path from "node:path";
import { paths } from "../paths";

function extractCwdArg(argv: string[]): string | null {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "-C" || a === "--cwd") return argv[i + 1] ?? null;
		if (a.startsWith("--cwd=")) return a.slice("--cwd=".length);
		if (a.startsWith("-C=")) return a.slice("-C=".length);
	}
	return null;
}

export function applyCwdFromArgv(): void {
	const value = extractCwdArg(process.argv.slice(2));
	if (!value) return;
	const resolved = path.resolve(value);
	if (existsSync(resolved)) {
		process.chdir(resolved);
		return;
	}
	const cwdBase = path.basename(process.cwd());
	const inputBase = path.basename(value);
	const doubled =
		cwdBase &&
		inputBase &&
		cwdBase === inputBase &&
		resolved.endsWith(path.join(cwdBase, cwdBase));
	if (doubled) {
		throw new Error(
			`--cwd "${value}" resolves to ${resolved} which does not exist. ` +
				"Looks like you may already be inside that directory — re-run with --cwd as an absolute path, or from the parent.",
		);
	}
	throw new Error(`--cwd path does not exist: ${resolved}`);
}

export function maybeDefaultToCheck(): void {
	const positional = process.argv.slice(2).filter((a) => !a.startsWith("-"));
	if (positional.length) return;
	if (!existsSync(paths().manifest)) return;
	process.argv = [
		process.argv[0],
		process.argv[1],
		"check",
		...process.argv.slice(2),
	];
}
