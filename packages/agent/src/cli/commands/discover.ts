import type { Command } from "commander";
import { closeBrowser } from "../../browser/launch";
import { loadConfig, resolveBaseUrl } from "../../config";
import { discover } from "../../discover";
import type { Output } from "../output";

interface Opts {
	baseUrl?: string;
	maxRoutes: string;
	crawl: boolean;
}

export function registerDiscover(program: Command, out: Output): void {
	program
		.command("discover")
		.description(
			"enumerate candidate routes via BFS crawl + Next manifest + sitemap",
		)
		.option("--base-url <url>", "override base URL")
		.option("--max-routes <n>", "cap on routes returned", "50")
		.option("--no-crawl", "skip BFS crawl fallback")
		.action(async (opts: Opts) => {
			const baseUrl = resolveBaseUrl(await loadConfig(), opts.baseUrl);
			const routes = await discover({
				baseUrl,
				maxRoutes: Number(opts.maxRoutes),
				skipCrawl: !opts.crawl,
			});
			await closeBrowser();
			out.emit(
				{ ok: true, baseUrl, routes },
				routes.length
					? routes.map((r) => `${r.source.padEnd(14)} ${r.url}`).join("\n")
					: "no routes discovered",
			);
		});
}
