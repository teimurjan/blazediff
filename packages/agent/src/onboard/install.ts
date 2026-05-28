import { readFileSync } from "node:fs";
import { lstat, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadSkillFiles, type SkillFile, skillBodyOnly } from "./skill-loader";
import { STACKS, type Stack, type StackInfo } from "./stacks";

export type InstallStatus =
	| "created"
	| "updated"
	| "unchanged"
	| "skipped-exists"
	| "configured";

export interface InstallResult {
	stack: Stack;
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
	const frontmatter = [
		"---",
		'description: "Run, author, or update BlazeDiff visual regression tests. Trigger on visual test, screenshot regression, blazediff, /blazediff."',
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

export async function installStack(
	stack: Stack,
	cwd: string,
	opts: { force?: boolean } = {},
): Promise<InstallResult> {
	const info: StackInfo = STACKS[stack];

	// Local-judge stacks (moondream) install no skill file; onboarding wires the
	// judge backend into config instead (see the onboard command).
	if (info.kind === "local-judge") {
		return { stack, status: "configured" };
	}

	const target = info.target?.(cwd);
	const files = loadSkillFiles();

	if (info.format === "cursor-rule") {
		const content = renderCursorRule(files);
		const status = await writeIfChanged(target, content, opts.force);
		return { stack, path: target, status };
	}

	const targetDir = dirname(target);
	const statuses: InstallStatus[] = [];
	for (const file of files) {
		const filePath = join(targetDir, file.name);
		const status = await writeIfChanged(
			filePath,
			ensureTrailingNewline(file.content),
			opts.force,
		);
		statuses.push(status);
	}
	return { stack, path: target, status: combineStatuses(statuses) };
}
