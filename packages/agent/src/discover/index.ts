import type { DiscoveredRoute } from "../types";
import { crawlRoutes } from "./crawl";
import { discoverFromNextManifest } from "./next";
import { discoverFromSitemap } from "./sitemap";

export interface DiscoverOptions {
	baseUrl: string;
	cwd?: string;
	maxRoutes?: number;
	skipCrawl?: boolean;
}

function normalizePath(url: string): string {
	const [pathPart, query = ""] = url.split("?", 2);
	const trimmed = pathPart.replace(/\/+$/, "");
	const normalizedPath = trimmed === "" ? "/" : trimmed;
	return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function mergeBy(
	routes: DiscoveredRoute[],
	into: Map<string, DiscoveredRoute>,
): void {
	for (const r of routes) {
		const key = normalizePath(r.url);
		if (!into.has(key)) into.set(key, { ...r, url: key });
	}
}

export async function discover(
	opts: DiscoverOptions,
): Promise<DiscoveredRoute[]> {
	const cwd = opts.cwd ?? process.cwd();
	const merged = new Map<string, DiscoveredRoute>();

	mergeBy(await discoverFromNextManifest(cwd), merged);
	mergeBy(await discoverFromSitemap(opts.baseUrl), merged);

	if (!opts.skipCrawl) {
		const crawlMax = Math.max(0, (opts.maxRoutes ?? 50) - merged.size);
		if (crawlMax > 0) {
			mergeBy(
				await crawlRoutes({ baseUrl: opts.baseUrl, maxRoutes: crawlMax }),
				merged,
			);
		}
	}

	return Array.from(merged.values()).sort((a, b) => a.url.localeCompare(b.url));
}

export { crawlRoutes, discoverFromNextManifest, discoverFromSitemap };
