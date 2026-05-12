import type { Command } from "commander";
import { configHash, loadConfig } from "../../config";
import {
	addOrReplaceEntry,
	emptyManifest,
	loadManifest,
	makeEntry,
	removeEntry,
	saveManifest,
} from "../../manifest";
import type { Output } from "../output";
import { parseMaskList, parseViewport, parseWaitFor } from "../parsers";

interface AddOpts {
	url: string;
	viewport: string;
	mask: string;
	waitFor: string;
	fullPage: boolean;
	auth: string;
	createdBy: "agent" | "human";
}

export function registerManifest(program: Command, out: Output): void {
	const cmd = program
		.command("manifest")
		.description("manage .blazediff/manifest.json");

	cmd
		.command("add <id>")
		.requiredOption("--url <url>")
		.option("--viewport <WxH>", "viewport", "1280x800")
		.option("--mask <selectors>", "selectors", "")
		.option("--wait-for <list>", "wait list", "networkidle,fonts")
		.option("--no-full-page", "viewport-only (default: full page)")
		.option("--auth <required|none>", "mark auth-gated", "none")
		.option("--created-by <agent|human>", "provenance", "agent")
		.action(async (id: string, opts: AddOpts) => {
			const config = await loadConfig();
			if (!config)
				throw new Error("no config. Run `blazediff-agent init` first.");
			const manifest =
				(await loadManifest()) ?? emptyManifest(configHash(config));
			const entry = makeEntry({
				id,
				url: opts.url,
				viewport: parseViewport(opts.viewport),
				mask: parseMaskList(opts.mask),
				waitFor: parseWaitFor(opts.waitFor),
				fullPage: opts.fullPage,
				auth: opts.auth === "required" ? "required" : null,
				createdBy: opts.createdBy,
			});
			await saveManifest(addOrReplaceEntry(manifest, entry));
			out.emit(
				{ ok: true, entry },
				out.isTTY() ? `manifest: added ${id} (${entry.url})` : ".",
			);
		});

	cmd.command("remove <id>").action(async (id: string) => {
		const manifest = await loadManifest();
		if (!manifest) throw new Error("no manifest");
		await saveManifest(removeEntry(manifest, id));
		out.emit({ ok: true, removed: id }, `manifest: removed ${id}`);
	});

	cmd.command("list").action(async () => {
		const manifest = await loadManifest();
		if (!manifest) {
			out.emit({ entries: [] }, "no manifest");
			return;
		}
		out.emit(
			{ entries: manifest.entries },
			manifest.entries.map((e) => `${e.id.padEnd(30)} ${e.url}`).join("\n") ||
				"no entries",
		);
	});
}
