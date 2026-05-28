import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { loadConfig, saveConfig } from "../../config";
import type { JudgeBackend } from "../../judge";
import { type InstallResult, installStack } from "../../onboard/install";
import {
	CODING_AGENT_STACKS,
	detectStacks,
	parseStackList,
	STACKS,
	type Stack,
} from "../../onboard/stacks";
import type { AgentConfig } from "../../types";
import type { Output } from "../output";

function suggestOtherStacks(installed: Stack[]): string {
	const missing = CODING_AGENT_STACKS.filter((s) => !installed.includes(s));
	if (missing.length === 0) return "";
	const labels = missing.map((s) => STACKS[s].label).join(" / ");
	const ids = missing.join(",");
	return `\nAlso use ${labels}? Run: blazediff-agent onboard --stack ${ids}`;
}

interface Opts {
	stack?: string;
	force?: boolean;
}

async function promptForStacks(): Promise<Stack[]> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stderr,
	});
	try {
		const lines = [
			"No coding-agent stack detected. Which one(s) do you use?",
			...CODING_AGENT_STACKS.map(
				(id, i) =>
					`  [${i + 1}] ${STACKS[id].label.padEnd(16)} ${STACKS[id].target?.(process.cwd()) ?? ""}`,
			),
			"  [a] all three coding agents",
			`  [l] ${STACKS.local.label.padEnd(16)} local judge, no coding agent (Moondream + Qwen)`,
			"",
		];
		process.stderr.write(`${lines.join("\n")}`);
		const answer = (await rl.question("Choice (1/2/3/a/l): "))
			.trim()
			.toLowerCase();
		if (!answer) throw new Error("no stack selected; aborting");
		if (answer === "a" || answer === "all") return [...CODING_AGENT_STACKS];
		if (answer === "l" || answer === "local") return ["local"];
		const idx = Number(answer);
		if (!Number.isInteger(idx) || idx < 1 || idx > CODING_AGENT_STACKS.length) {
			throw new Error(
				`invalid choice "${answer}"; expected 1-${CODING_AGENT_STACKS.length}, "a", or "l"`,
			);
		}
		return [CODING_AGENT_STACKS[idx - 1] as Stack];
	} finally {
		rl.close();
	}
}

function humanizeResults(results: InstallResult[]): string {
	const lines = results.map((r) => {
		const info = STACKS[r.stack];
		if (r.status === "configured") {
			return `  ${info.label.padEnd(16)} configured local judge (model downloads on first check)`;
		}
		const verb =
			r.status === "created"
				? "wrote"
				: r.status === "updated"
					? "updated"
					: r.status === "unchanged"
						? "unchanged"
						: "skipped (exists; pass --force to overwrite)";
		const scopeTag = info.scope === "user" ? " [user-global]" : "";
		return `  ${info.label.padEnd(16)} ${verb}: ${r.path}${scopeTag}`;
	});
	const installed = results.map((r) => r.stack);
	const hint = installed.includes("local") ? "" : suggestOtherStacks(installed);
	return ["BlazeDiff playbook installed:", ...lines].join("\n") + hint;
}

/** Persist the judge backend implied by the onboarded stack(s). */
async function persistJudge(judge: JudgeBackend, cwd: string): Promise<void> {
	const existing = await loadConfig(cwd);
	const config: AgentConfig = { ...(existing ?? { devServer: null }), judge };
	await saveConfig(config, cwd);
}

export function registerOnboard(program: Command, out: Output): void {
	program
		.command("onboard")
		.description(
			"install the BlazeDiff playbook for your stack in cwd. Auto-detects Claude Code (.claude/), Codex (AGENTS.md), and Cursor (.cursor/). Use --stack local for a local (Moondream + Qwen) judge. Prompts on TTY when none detected.",
		)
		.option(
			"--stack <list>",
			'comma-separated stack ids, or "all". valid: claude,codex,cursor,all,local (local cannot be combined)',
		)
		.option(
			"--force",
			"overwrite existing playbook files (idempotent without --force only when content matches)",
		)
		.action(async (opts: Opts) => {
			const cwd = process.cwd();
			let targets: Stack[];

			if (opts.stack) {
				targets = parseStackList(opts.stack);
			} else {
				const detected = detectStacks(cwd);
				if (detected.length > 0) {
					targets = detected;
				} else if (out.isTTY() && !out.isJson()) {
					targets = await promptForStacks();
				} else {
					throw new Error(
						"no coding-agent stack detected in cwd. pass --stack <claude|codex|cursor|all|local> explicitly.",
					);
				}
			}

			const results: InstallResult[] = [];
			for (const t of targets) {
				results.push(await installStack(t, cwd, { force: opts.force }));
			}

			const judge: JudgeBackend = targets.includes("local") ? "local" : "host";
			await persistJudge(judge, cwd);

			out.emit(
				{
					ok: true,
					detected: detectStacks(cwd),
					judge,
					installed: results,
				},
				humanizeResults(results),
			);
		});
}
