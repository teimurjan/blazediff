import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as util from "node:util";
import { paths } from "./paths";

// Candidate files in precedence order (first to set a key wins). The
// `.blazediff/` files are the blazediff-scoped, gitignored home for test-only
// creds; the project-root files are the app's own. A real environment variable
// always beats any file.
function envFiles(cwd: string): string[] {
	const root = paths(cwd).root;
	return [
		path.join(root, ".env.local"),
		path.join(root, ".env"),
		path.join(cwd, ".env.local"),
		path.join(cwd, ".env"),
	];
}

function parse(content: string): Record<string, string> {
	// Namespace import + feature-detect: a named `{ parseEnv }` import would throw
	// at module load on Node versions that don't export it, before this guard.
	if (typeof util.parseEnv === "function") {
		return util.parseEnv(content) as Record<string, string>;
	}
	// Minimal fallback for Node without util.parseEnv: KEY=VALUE lines.
	const out: Record<string, string> = {};
	for (const raw of content.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (key) out[key] = value;
	}
	return out;
}

/**
 * Load env files (`.blazediff/.env[.local]` then `.env[.local]`) into
 * `process.env` so harnesses can read secrets (e.g. `BLAZEDIFF_AUTH_*`) without
 * the user exporting them by hand. Real environment variables always win, and
 * `.blazediff/` files take precedence over the project-root ones. Returns the
 * files actually applied.
 */
export function loadEnvFiles(cwd: string = process.cwd()): string[] {
	const loaded: string[] = [];
	for (const file of envFiles(cwd)) {
		if (!existsSync(file)) continue;
		let parsed: Record<string, string>;
		try {
			parsed = parse(readFileSync(file, "utf8"));
		} catch {
			continue;
		}
		let applied = false;
		for (const [key, value] of Object.entries(parsed)) {
			if (process.env[key] === undefined) {
				process.env[key] = value;
				applied = true;
			}
		}
		if (applied) loaded.push(file);
	}
	return loaded;
}
