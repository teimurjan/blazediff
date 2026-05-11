import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";

const ENTRIES = [
	"actual/",
	"diffs/",
	"report.json",
	"dev-server.log",
	"dev-server.pid",
	"*.tmp",
];
const HEADER =
	"# blazediff: generated artifacts (committed: config.json, manifest.json, baselines/)\n";

export async function ensureGitignore(cwd: string): Promise<void> {
	const file = paths(cwd).gitignore;
	await mkdir(path.dirname(file), { recursive: true });
	const existing = existsSync(file) ? await readFile(file, "utf8") : "";
	const lines = existing.split("\n").map((l) => l.trim());
	const missing = ENTRIES.filter((e) => !lines.includes(e));
	if (!missing.length && existing) return;
	const body = existing
		? `${existing.replace(/\n+$/, "")}\n${missing.join("\n")}\n`
		: `${HEADER}${ENTRIES.join("\n")}\n`;
	await writeFile(file, body, "utf8");
}
