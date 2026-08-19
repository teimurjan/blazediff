import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillFile {
	name: string;
	content: string;
}

/**
 * Skills shipped with the agent, in install order. The list is explicit so the
 * name is a type; the files *within* each skill are discovered, so adding a
 * sidecar (like JUDGING.md) needs no code change here.
 */
export const SKILLS = ["blazediff", "image-compare"] as const;
export type SkillName = (typeof SKILLS)[number];

/** Install-time instructions for humans; never shipped into a skill dir. */
const NOT_A_SKILL_FILE = "INSTALL.md";

let cachedRoot: string | null = null;
const cachedFiles = new Map<SkillName, SkillFile[]>();

function moduleDir(): string {
	return dirname(fileURLToPath(import.meta.url));
}

/**
 * The directory holding one sub-directory per skill: `skills/` in the published
 * package (written by the prebuild copy), `skill/` when running from the repo.
 */
function resolveSkillsRoot(): string {
	if (cachedRoot !== null) return cachedRoot;
	const here = moduleDir();
	const candidates = [
		join(here, "..", "skills"),
		join(here, "..", "..", "skills"),
		join(here, "..", "..", "..", "skill"),
		join(here, "..", "..", "..", "..", "skill"),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, SKILLS[0], "SKILL.md"))) {
			cachedRoot = dir;
			return cachedRoot;
		}
	}
	throw new Error(
		`could not locate bundled skills (looked in: ${candidates.join(", ")}). reinstall @blazediff/agent.`,
	);
}

/** SKILL.md first — the cursor-rule renderer treats it as the body. */
function skillFileOrder(a: string, b: string): number {
	if (a === "SKILL.md") return -1;
	if (b === "SKILL.md") return 1;
	return a.localeCompare(b);
}

export function loadSkillFiles(skill: SkillName): SkillFile[] {
	const cached = cachedFiles.get(skill);
	if (cached !== undefined) return cached;

	const dir = join(resolveSkillsRoot(), skill);
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".md") && name !== NOT_A_SKILL_FILE)
		.sort(skillFileOrder)
		.map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") }));

	cachedFiles.set(skill, files);
	return files;
}

function frontmatterBounds(lines: string[]): number {
	if (!lines[0]?.startsWith("---")) return -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.startsWith("---")) return i;
	}
	return -1;
}

export function skillBodyOnly(content: string): string {
	const lines = content.split("\n");
	const end = frontmatterBounds(lines);
	if (end <= 0) return content;
	return lines
		.slice(end + 1)
		.join("\n")
		.trimStart();
}

/** The skill's own `description:` — the single source for stack-specific rules. */
export function skillDescription(content: string): string {
	const lines = content.split("\n");
	const end = frontmatterBounds(lines);
	if (end <= 0) return "";
	const line = lines.slice(1, end).find((l) => l.startsWith("description:"));
	return line ? line.slice("description:".length).trim() : "";
}
