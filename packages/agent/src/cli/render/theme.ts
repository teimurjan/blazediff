import path from "node:path";
import pc from "picocolors";
import type { VerdictLabel } from "../../diff/verdict";
import type { CheckResult } from "../../types";

/**
 * Shared terminal styling for the CLI. `picocolors` auto-disables when stdout is
 * not a TTY or `NO_COLOR` is set, so the same calls produce clean plain text in
 * pipes, CI logs, and `--json` payloads (which never go through here).
 */
export { pc };
export const dim = pc.dim;
export const bold = pc.bold;

type Status = CheckResult["status"];

/** Colored status glyph used in progress lines and failure blocks. */
export function statusGlyph(status: Status | string): string {
	switch (status) {
		case "pass":
			return pc.green("✓");
		case "needs-judgment":
			return pc.yellow("?");
		case "stale-baseline":
		case "missing-baseline":
			return pc.yellow("!");
		default:
			return pc.red("✗");
	}
}

/** Color a verdict label by how alarming it is. */
export function labelColor(label: VerdictLabel | string): string {
	switch (label) {
		case "regression-likely":
			return pc.red(label);
		case "intentional-likely":
			return pc.cyan(label);
		case "noise-likely":
			return pc.dim(label);
		default:
			return pc.yellow(label);
	}
}

/** Shorten an absolute path to one relative to `cwd` for compact display. */
export function relPath(p: string, cwd: string = process.cwd()): string {
	if (!p) return p;
	const rel = path.relative(cwd, p);
	return rel && !rel.startsWith("..") ? rel : p;
}
