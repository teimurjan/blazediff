import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import {
	ALL_HARNESSES,
	detectHarnesses,
	HARNESSES,
	type Harness,
	parseHarnessList,
} from "../../onboard/harnesses";
import { type InstallResult, installHarness } from "../../onboard/install";
import type { Output } from "../output";

function suggestOtherHarnesses(installed: Harness[]): string {
	const missing = ALL_HARNESSES.filter((h) => !installed.includes(h));
	if (missing.length === 0) return "";
	const labels = missing.map((h) => HARNESSES[h].label).join(" / ");
	const ids = missing.join(",");
	return `\nAlso use ${labels}? Run: blazediff-agent onboard --harness ${ids}`;
}

interface Opts {
	harness?: string;
	force?: boolean;
}

async function promptForHarnesses(): Promise<Harness[]> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stderr,
	});
	try {
		const lines = [
			"No coding-agent harness detected. Which one(s) do you use?",
			...ALL_HARNESSES.map(
				(id, i) =>
					`  [${i + 1}] ${HARNESSES[id].label.padEnd(12)} ${HARNESSES[id].target(process.cwd())}`,
			),
			"  [a] all three",
			"",
		];
		process.stderr.write(`${lines.join("\n")}`);
		const answer = (await rl.question("Choice (1/2/3/a): "))
			.trim()
			.toLowerCase();
		if (!answer) throw new Error("no harness selected; aborting");
		if (answer === "a" || answer === "all") return [...ALL_HARNESSES];
		const idx = Number(answer);
		if (!Number.isInteger(idx) || idx < 1 || idx > ALL_HARNESSES.length) {
			throw new Error(
				`invalid choice "${answer}"; expected 1-${ALL_HARNESSES.length} or "a"`,
			);
		}
		return [ALL_HARNESSES[idx - 1] as Harness];
	} finally {
		rl.close();
	}
}

function humanizeResults(results: InstallResult[]): string {
	const lines = results.map((r) => {
		const verb =
			r.status === "created"
				? "wrote"
				: r.status === "updated"
					? "updated"
					: r.status === "unchanged"
						? "unchanged"
						: "skipped (exists; pass --force to overwrite)";
		const info = HARNESSES[r.harness];
		const scopeTag = info.scope === "user" ? " [user-global]" : "";
		return `  ${info.label.padEnd(12)} ${verb}: ${r.path}${scopeTag}`;
	});
	const installed = results.map((r) => r.harness);
	const hint = suggestOtherHarnesses(installed);
	return ["BlazeDiff playbook installed:", ...lines].join("\n") + hint;
}

export function registerOnboard(program: Command, out: Output): void {
	program
		.command("onboard")
		.description(
			"install the BlazeDiff playbook into the coding-agent harness in cwd. Auto-detects Claude Code (.claude/), Codex (AGENTS.md), and Cursor (.cursor/). Prompts on TTY when none detected.",
		)
		.option(
			"--harness <list>",
			'comma-separated harness ids, or "all". valid: claude,codex,cursor,all',
		)
		.option(
			"--force",
			"overwrite existing playbook files (idempotent without --force only when content matches)",
		)
		.action(async (opts: Opts) => {
			const cwd = process.cwd();
			let targets: Harness[];

			if (opts.harness) {
				targets = parseHarnessList(opts.harness);
			} else {
				const detected = detectHarnesses(cwd);
				if (detected.length > 0) {
					targets = detected;
				} else if (out.isTTY() && !out.isJson()) {
					targets = await promptForHarnesses();
				} else {
					throw new Error(
						"no coding-agent harness detected in cwd. pass --harness <claude|codex|cursor|all> explicitly.",
					);
				}
			}

			const results: InstallResult[] = [];
			for (const t of targets) {
				results.push(await installHarness(t, cwd, { force: opts.force }));
			}

			out.emit(
				{
					ok: true,
					detected: detectHarnesses(cwd),
					installed: results,
				},
				humanizeResults(results),
			);
		});
}
