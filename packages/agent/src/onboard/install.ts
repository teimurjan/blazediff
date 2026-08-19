import { readFileSync } from "node:fs";
import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	loadSkillFiles,
	SKILLS,
	type SkillFile,
	type SkillName,
	skillBodyOnly,
	skillDescription,
} from "./skill-loader";
import { STACKS, type Stack, type StackInfo } from "./stacks";

export type InstallStatus =
	| "created"
	| "updated"
	| "unchanged"
	| "skipped-exists"
	| "configured";

export interface InstallResult {
	stack: Stack;
	/** Absent only for local-judge stacks, which install no skill. */
	skill?: SkillName;
	path?: string;
	status: InstallStatus;
}

function ensureTrailingNewline(s: string): string {
	return s.endsWith("\n") ? s : `${s}\n`;
}

function renderCursorRule(files: SkillFile[]): string {
	const skill = files.find((f) => f.name === "SKILL.md")?.content ?? "";
	const sidecars = files.filter((f) => f.name !== "SKILL.md");
	const body = skillBodyOnly(skill).trim();
	// JSON.stringify, not hand-quoting: skill descriptions contain double quotes
	// around their trigger phrases, and a bare YAML double-quoted scalar would
	// terminate on the first one.
	const frontmatter = [
		"---",
		`description: ${JSON.stringify(skillDescription(skill))}`,
		"alwaysApply: false",
		"---",
		"",
	].join("\n");
	const sidecarBlocks = sidecars
		.map((f) => `\n\n---\n\n<!-- ${f.name} -->\n\n${f.content.trim()}`)
		.join("");
	return `${frontmatter}${body}${sidecarBlocks}\n`;
}

async function writeIfChanged(
	target: string,
	content: string,
	force: boolean | undefined,
): Promise<InstallStatus> {
	const stat = await lstat(target).catch(() => null);
	const isSymlink = stat?.isSymbolicLink() ?? false;
	const exists = stat !== null;

	if (isSymlink) {
		await unlink(target);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content, "utf8");
		return "updated";
	}

	if (exists) {
		const current = readFileSync(target, "utf8");
		if (current === content) return "unchanged";
		if (!force) return "skipped-exists";
	}
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content, "utf8");
	return exists ? "updated" : "created";
}

function combineStatuses(statuses: InstallStatus[]): InstallStatus {
	if (statuses.some((s) => s === "skipped-exists")) return "skipped-exists";
	if (statuses.some((s) => s === "created")) return "created";
	if (statuses.some((s) => s === "updated")) return "updated";
	return "unchanged";
}

async function installSkill(
	stack: Stack,
	info: StackInfo & { kind: "skill-install" },
	skill: SkillName,
	cwd: string,
	force: boolean | undefined,
): Promise<InstallResult> {
	const target = info.target(cwd, skill);
	const files = loadSkillFiles(skill);

	if (info.format === "cursor-rule") {
		const status = await writeIfChanged(target, renderCursorRule(files), force);
		return { stack, skill, path: target, status };
	}

	const targetDir = dirname(target);
	const statuses: InstallStatus[] = [];
	for (const file of files) {
		statuses.push(
			await writeIfChanged(
				join(targetDir, file.name),
				ensureTrailingNewline(file.content),
				force,
			),
		);
	}
	return { stack, skill, path: target, status: combineStatuses(statuses) };
}

/** Installs every bundled skill for one stack — one result per skill. */
export async function installStack(
	stack: Stack,
	cwd: string,
	opts: { force?: boolean } = {},
): Promise<InstallResult[]> {
	const info: StackInfo = STACKS[stack];

	// Local-judge stacks (moondream) install no skill file; onboarding wires the
	// judge backend into config instead (see the onboard command).
	if (info.kind === "local-judge") {
		return [{ stack, status: "configured" }];
	}

	const results: InstallResult[] = [];
	for (const skill of SKILLS) {
		results.push(await installSkill(stack, info, skill, cwd, opts.force));
	}
	return results;
}
