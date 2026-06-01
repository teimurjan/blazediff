import type { Command } from "commander";
import { closeBrowser } from "../../browser/launch";
import { loadConfig, resolveBaseUrl } from "../../config";
import { discover } from "../../discover";
import {
	DEFAULT_SAMPLE_THRESHOLD,
	DEFAULT_SAMPLES_PER_TEMPLATE,
} from "../../discover/templates";
import type { Output } from "../output";

interface Opts {
	baseUrl?: string;
	maxRoutes: string;
	sampleTemplates: boolean;
	samplesPerTemplate: string;
	sampleThreshold: string;
}

function posInt(value: string, fallback: number): number {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function registerDiscover(program: Command, out: Output): void {
	program
		.command("discover")
		.description(
			"enumerate reachable routes by crawling links from the landing page",
		)
		.option("--base-url <url>", "override base URL")
		.option("--max-routes <n>", "cap on routes returned", "50")
		.option(
			"--no-sample-templates",
			"keep every reachable route, even large list/detail groups",
		)
		.option(
			"--samples-per-template <n>",
			"representatives to keep per templated group",
			String(DEFAULT_SAMPLES_PER_TEMPLATE),
		)
		.option(
			"--sample-threshold <n>",
			"group size at which template sampling kicks in",
			String(DEFAULT_SAMPLE_THRESHOLD),
		)
		.action(async (opts: Opts) => {
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const routes = await discover({
				baseUrl,
				maxRoutes: Number(opts.maxRoutes),
				sampleTemplates: opts.sampleTemplates && {
					threshold: posInt(opts.sampleThreshold, DEFAULT_SAMPLE_THRESHOLD),
					samples: posInt(
						opts.samplesPerTemplate,
						DEFAULT_SAMPLES_PER_TEMPLATE,
					),
				},
			});
			await closeBrowser();
			out.emit(
				{ ok: true, baseUrl, routes },
				routes.length
					? routes.map((r) => r.url).join("\n")
					: "no routes discovered",
			);
		});
}
