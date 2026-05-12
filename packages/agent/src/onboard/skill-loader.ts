import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillFile {
	name: string;
	content: string;
}

const SKILL_FILES = ["SKILL.md", "JUDGING.md", "MASKING.md"] as const;

let cachedDir: string | null = null;
let cachedFiles: SkillFile[] | null = null;

function moduleDir(): string {
	return dirname(fileURLToPath(import.meta.url));
}

function resolveSkillDir(): string {
	if (cachedDir !== null) return cachedDir;
	const here = moduleDir();
	const candidates = [
		join(here, ".."),
		join(here, "..", ".."),
		join(here, "..", "..", "..", "skill", "blazediff"),
		join(here, "..", "..", "..", "..", "skill", "blazediff"),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, "SKILL.md"))) {
			cachedDir = dir;
			return cachedDir;
		}
	}
	throw new Error(
		`could not locate bundled SKILL.md (looked in: ${candidates.join(", ")}). reinstall @blazediff/agent.`,
	);
}

export function loadSkillContent(): string {
	const dir = resolveSkillDir();
	return readFileSync(join(dir, "SKILL.md"), "utf8");
}

export function loadSkillFiles(): SkillFile[] {
	if (cachedFiles !== null) return cachedFiles;
	const dir = resolveSkillDir();
	cachedFiles = SKILL_FILES.filter((name) => existsSync(join(dir, name))).map(
		(name) => ({ name, content: readFileSync(join(dir, name), "utf8") }),
	);
	return cachedFiles;
}

export function skillBodyOnly(content: string): string {
	const lines = content.split("\n");
	if (lines[0]?.startsWith("---")) {
		let end = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i]?.startsWith("---")) {
				end = i;
				break;
			}
		}
		if (end > 0)
			return lines
				.slice(end + 1)
				.join("\n")
				.trimStart();
	}
	return content;
}
