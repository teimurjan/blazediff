import type { Command } from "commander";
import { DEFAULT_THRESHOLD } from "../../defaults";
import { diffEntry } from "../../diff";
import { findEntry, loadManifest } from "../../manifest";
import { paths } from "../../paths";
import type { Output } from "../output";

interface Opts {
	threshold: string;
	emitDiffPng?: boolean;
}

export function registerDiff(program: Command, out: Output): void {
	program
		.command("diff <id>")
		.description("diff a route's baseline against its actual capture")
		.option(
			"--threshold <n>",
			"color threshold (0-1)",
			String(DEFAULT_THRESHOLD),
		)
		.option("--emit-diff-png", "write diff PNG to .blazediff/diffs/")
		.action(async (id: string, opts: Opts) => {
			const manifest = await loadManifest();
			if (!manifest) throw new Error("no manifest");
			const entry = findEntry(manifest, id);
			if (!entry) throw new Error(`no entry with id ${id}`);

			const baselinePath = `${paths().baselines}/${id}.png`;
			const actualPath = `${paths().actual}/${id}.png`;
			const outcome = await diffEntry(id, baselinePath, actualPath, {
				threshold: Number(opts.threshold),
				emitDiffPng: Boolean(opts.emitDiffPng),
			});

			out.emit(
				outcome,
				outcome.match ? `${id}: match` : `${id}: ${outcome.reason ?? "diff"}`,
			);
			if (!outcome.match) process.exitCode = 1;
		});
}
