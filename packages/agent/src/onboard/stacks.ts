import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JudgeBackend } from "../judge/types";

export type Stack = "claude" | "codex" | "cursor" | "local";

interface StackBase {
	id: Stack;
	label: string;
	/** judge backend `check` should default to once this stack is onboarded */
	judge: JudgeBackend;
}

/** A coding-agent stack onboarded by writing a skill file. */
export interface SkillInstallStack extends StackBase {
	kind: "skill-install";
	detect: (cwd: string) => boolean;
	target: (cwd: string, skill: string) => string;
	format: "skill-file" | "cursor-rule";
	scope: "project" | "user";
}

/** A stack onboarded by wiring a local judge backend; it writes no files. */
export interface LocalJudgeStack extends StackBase {
	kind: "local-judge";
	// Declared as `never` rather than omitted so callers can still probe these
	// on the union (`STACKS[id].detect?.(cwd)`) without narrowing first.
	detect?: never;
	target?: never;
	format?: never;
	scope?: never;
}

/**
 * The two shapes are a discriminated union rather than one bag of optionals, so
 * narrowing on `kind` proves `target` and friends are present — which is what
 * the install path relies on after it returns early for local-judge stacks.
 */
export type StackInfo = SkillInstallStack | LocalJudgeStack;

const someExists = (paths: string[]) => paths.some((p) => existsSync(p));

export const STACKS: Record<Stack, StackInfo> = {
	claude: {
		id: "claude",
		label: "Claude Code",
		kind: "skill-install",
		judge: "host",
		detect: (cwd) =>
			someExists([
				join(cwd, ".claude"),
				join(cwd, "CLAUDE.md"),
				join(cwd, "AGENTS.md"),
			]),
		target: (cwd, skill) => join(cwd, ".claude", "skills", skill, "SKILL.md"),
		format: "skill-file",
		scope: "project",
	},
	codex: {
		id: "codex",
		label: "Codex",
		kind: "skill-install",
		judge: "host",
		detect: (cwd) =>
			someExists([
				join(cwd, "AGENTS.md"),
				join(cwd, ".codex"),
				join(homedir(), ".codex"),
			]),
		target: (_cwd, skill) =>
			join(homedir(), ".codex", "skills", skill, "SKILL.md"),
		format: "skill-file",
		scope: "user",
	},
	cursor: {
		id: "cursor",
		label: "Cursor",
		kind: "skill-install",
		judge: "host",
		detect: (cwd) =>
			someExists([join(cwd, ".cursor"), join(cwd, ".cursorrules")]),
		target: (cwd, skill) => join(cwd, ".cursor", "rules", `${skill}.mdc`),
		format: "cursor-rule",
		scope: "project",
	},
	local: {
		id: "local",
		label: "Local (Moondream + Qwen)",
		kind: "local-judge",
		judge: "local",
	},
};

/**
 * Coding-agent stacks: what `all` expands to and what auto-detection considers.
 * `local` is deliberately excluded — it's a local judge, opted into explicitly.
 */
export const CODING_AGENT_STACKS: Stack[] = ["claude", "codex", "cursor"];

export function detectStacks(cwd: string): Stack[] {
	return CODING_AGENT_STACKS.filter((id) => STACKS[id].detect?.(cwd));
}

export function parseStackList(input: string): Stack[] {
	const tokens = input
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

	if (tokens.includes("all")) {
		if (tokens.some((t) => t !== "all")) {
			throw new Error('"all" cannot be combined with other stacks');
		}
		return [...CODING_AGENT_STACKS];
	}

	const out: Stack[] = [];
	for (const t of tokens) {
		if (!(t in STACKS)) {
			throw new Error(
				`unknown stack "${t}". valid: ${[...Object.keys(STACKS), "all"].join(", ")}`,
			);
		}
		if (!out.includes(t as Stack)) out.push(t as Stack);
	}

	if (out.includes("local") && out.length > 1) {
		throw new Error(
			'"local" is a local judge stack and cannot be combined with coding-agent stacks',
		);
	}

	return out;
}
