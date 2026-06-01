import type { DiscoveredRoute } from "../types";
import { crawlRoutes } from "./crawl";
import {
	type CollapseResult,
	collapseTemplates,
	type TemplateSampling,
} from "./templates";

export interface DiscoverOptions {
	baseUrl: string;
	cwd?: string;
	maxRoutes?: number;
	// Sample large list/detail template groups down to a few representatives.
	// `false` disables sampling (every reachable route is returned); an object
	// overrides the thresholds. Defaults to on with built-in thresholds.
	sampleTemplates?: boolean | TemplateSampling;
}

function normalizePath(url: string): string {
	const [pathPart, query = ""] = url.split("?", 2);
	const trimmed = pathPart.replace(/\/+$/, "");
	const normalizedPath = trimmed === "" ? "/" : trimmed;
	return query ? `${normalizedPath}?${query}` : normalizedPath;
}

function dedupe(routes: DiscoveredRoute[]): DiscoveredRoute[] {
	const merged = new Map<string, DiscoveredRoute>();
	for (const r of routes) {
		const key = normalizePath(r.url);
		if (!merged.has(key)) merged.set(key, { ...r, url: key });
	}
	return Array.from(merged.values());
}

export async function discover(
	opts: DiscoverOptions,
): Promise<DiscoveredRoute[]> {
	const crawled = await crawlRoutes({
		baseUrl: opts.baseUrl,
		maxRoutes: opts.maxRoutes ?? 50,
	});
	const deduped = dedupe(crawled);
	const sampling = opts.sampleTemplates ?? true;
	const routes =
		sampling === false
			? deduped
			: collapseTemplates(deduped, sampling === true ? undefined : sampling)
					.routes;
	return routes.sort((a, b) => a.url.localeCompare(b.url));
}

export { crawlRoutes, collapseTemplates };
export type { CollapseResult, TemplateSampling };
