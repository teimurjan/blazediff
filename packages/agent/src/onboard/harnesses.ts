import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Harness = "claude" | "codex" | "cursor";

export interface HarnessInfo {
	id: Harness;
	label: string;
	detect: (cwd: string) => boolean;
	target: (cwd: string) => string;
	format: "skill-file" | "cursor-rule";
	scope: "project" | "user";
}

const someExists = (paths: string[]) => paths.some((p) => existsSync(p));

export const HARNESSES: Record<Harness, HarnessInfo> = {
	claude: {
		id: "claude",
		label: "Claude Code",
		detect: (cwd) =>
			someExists([
				join(cwd, ".claude"),
				join(cwd, "CLAUDE.md"),
				join(cwd, "AGENTS.md"),
			]),
		target: (cwd) => join(cwd, ".claude", "skills", "blazediff", "SKILL.md"),
		format: "skill-file",
		scope: "project",
	},
	codex: {
		id: "codex",
		label: "Codex",
		detect: (cwd) =>
			someExists([
				join(cwd, "AGENTS.md"),
				join(cwd, ".codex"),
				join(homedir(), ".codex"),
			]),
		target: () => join(homedir(), ".codex", "skills", "blazediff", "SKILL.md"),
		format: "skill-file",
		scope: "user",
	},
	cursor: {
		id: "cursor",
		label: "Cursor",
		detect: (cwd) =>
			someExists([join(cwd, ".cursor"), join(cwd, ".cursorrules")]),
		target: (cwd) => join(cwd, ".cursor", "rules", "blazediff.mdc"),
		format: "cursor-rule",
		scope: "project",
	},
};

export const ALL_HARNESSES: Harness[] = ["claude", "codex", "cursor"];

export function detectHarnesses(cwd: string): Harness[] {
	return ALL_HARNESSES.filter((id) => HARNESSES[id].detect(cwd));
}

export function parseHarnessList(input: string): Harness[] {
	const tokens = input
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	if (tokens.includes("all")) return [...ALL_HARNESSES];
	const out: Harness[] = [];
	for (const t of tokens) {
		if (!(t in HARNESSES)) {
			throw new Error(
				`unknown harness "${t}". valid: ${[...ALL_HARNESSES, "all"].join(", ")}`,
			);
		}
		if (!out.includes(t as Harness)) out.push(t as Harness);
	}
	return out;
}
