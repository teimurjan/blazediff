import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { type CaptureRouteInput, runCaptures } from "../../captures";
import { loadConfig, resolveBaseUrl } from "../../config";
import type { Output } from "../output";
import {
	parseMaskList,
	parseRoutesPayload,
	parseViewport,
	parseWaitFor,
	readStdin,
} from "../parsers";

interface Opts {
	routes?: string;
	stdin?: boolean;
	id?: string;
	url?: string;
	viewport: string;
	mask: string;
	waitFor: string;
	fullPage: boolean;
	mode: "baseline" | "actual";
	baseUrl?: string;
	manifest: boolean;
	harness?: string[];
}

async function resolveRoutes(opts: Opts): Promise<CaptureRouteInput[]> {
	const sources = [opts.routes, opts.stdin, opts.id || opts.url].filter(
		Boolean,
	).length;
	if (sources === 0) {
		throw new Error(
			"provide one of: --routes <file>, --stdin, or --id <id> --url <url>",
		);
	}
	if (opts.routes && opts.stdin) {
		throw new Error("--routes and --stdin are mutually exclusive");
	}
	if (opts.routes) {
		return parseRoutesPayload(
			await readFile(path.resolve(opts.routes), "utf8"),
		);
	}
	if (opts.stdin) {
		return parseRoutesPayload(await readStdin());
	}
	if (!opts.id || !opts.url) {
		throw new Error(
			"--id and --url must both be provided for single-route capture",
		);
	}
	return [
		{
			id: opts.id,
			url: opts.url,
			viewport: parseViewport(opts.viewport),
			mask: parseMaskList(opts.mask),
			waitFor: parseWaitFor(opts.waitFor),
			fullPage: opts.fullPage,
			harnesses: opts.harness,
		},
	];
}

export function registerCapture(program: Command, out: Output): void {
	program
		.command("capture")
		.description(
			"capture one or more deterministic screenshots. Reads routes from --routes <file>, --stdin, or --id/--url for a single route.",
		)
		.option("--routes <file>", "JSON file with an array of route entries")
		.option("--stdin", "read JSON array of route entries from stdin")
		.option("--id <id>", "single-route id (used with --url)")
		.option("--url <url>", "single-route URL (used with --id)")
		.option(
			"--viewport <WxH>",
			"default viewport for inline single route",
			"1280x800",
		)
		.option("--mask <selectors>", "default mask for inline single route", "")
		.option(
			"--wait-for <list>",
			"default wait list for inline single route",
			"networkidle,fonts",
		)
		.option("--no-full-page", "default: viewport-only (default is full page)")
		.option(
			"--mode <baseline|actual>",
			"default mode (entries can override)",
			"baseline",
		)
		.option("--base-url <url>", "override base URL")
		.option(
			"--harness <name>",
			"attach a harness to the inline single route (repeatable; pass params via --routes/--stdin JSON)",
			(value: string, prev: string[] = []) => [...prev, value],
		)
		.option(
			"--no-manifest",
			"do not write manifest entries (baseline mode only)",
		)
		.action(async (opts: Opts) => {
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const routes = await resolveRoutes(opts);

			const report = await runCaptures({
				baseUrl,
				routes,
				mode: opts.mode,
				writeManifest: opts.manifest,
			});

			const human = out.isTTY()
				? `captured ${report.succeeded}/${report.total} (manifest: +${report.manifestUpdates})${
						report.failed ? `, ${report.failed} failed` : ""
					}`
				: ".";
			out.emit(report, human);
			if (report.failed > 0) process.exitCode = 1;
		});
}
