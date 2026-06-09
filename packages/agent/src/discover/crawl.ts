import { acquireStableContext, releaseStableContext } from "../browser/launch";
import type { DiscoveredRoute } from "../types";

export interface CrawlOptions {
	baseUrl: string;
	maxRoutes?: number;
	maxDepth?: number;
}

interface QueueItem {
	url: string;
	depth: number;
}

function extractInternalLinks(
	base: URL,
	target: string,
	hrefs: string[],
): string[] {
	const out: string[] = [];
	for (const href of hrefs) {
		if (
			!href ||
			href.startsWith("#") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:")
		) {
			continue;
		}
		try {
			const u = new URL(href, target);
			if (u.origin !== base.origin) continue;
			const path = u.pathname + u.search;
			if (path.startsWith("/api/")) continue;
			out.push(path);
		} catch {
			// malformed href - skip
		}
	}
	return out;
}

const CRAWL_VIEWPORT = { width: 1024, height: 768 };
const CRAWL_WORKERS = 4;

export async function crawlRoutes(
	opts: CrawlOptions,
): Promise<DiscoveredRoute[]> {
	const maxRoutes = opts.maxRoutes ?? 50;
	const maxDepth = opts.maxDepth ?? 2;
	const base = new URL(opts.baseUrl);
	const visited = new Set<string>(["/"]);
	const queue: QueueItem[] = [{ url: "/", depth: 0 }];
	const discovered: DiscoveredRoute[] = [];
	// Final post-redirect paths already recorded, so distinct links that 301 to
	// the same page collapse to one route instead of one per redirecting href.
	const recorded = new Set<string>();

	const record = (path: string): void => {
		if (recorded.has(path)) return;
		recorded.add(path);
		discovered.push({ url: path, source: "crawl" });
	};

	const handle = await acquireStableContext(CRAWL_VIEWPORT);

	const fetchOne = async (): Promise<void> => {
		while (queue.length && discovered.length < maxRoutes) {
			const item = queue.shift();
			if (!item) return;
			if (discovered.length >= maxRoutes) return;

			const page = await handle.context.newPage();
			const requested = new URL(item.url, base).toString();
			// Fall back to the requested path if navigation never resolves a URL.
			let finalPath = item.url;
			let resolved = requested;
			let hrefs: string[] = [];
			try {
				await page.goto(requested, {
					waitUntil: "domcontentloaded",
					timeout: 15_000,
				});
				// Record the settled URL, not the queued href: a link to a redirect
				// (e.g. /docs/core -> /apis/core) must be filed under its destination,
				// otherwise the route id names a path the screenshot never shows.
				const finalUrl = new URL(page.url());
				if (finalUrl.origin === base.origin) {
					resolved = finalUrl.toString();
					finalPath = finalUrl.pathname + finalUrl.search;
				}
				if (item.depth < maxDepth) {
					// On hydrated SPAs the nav renders after JS, so domcontentloaded
					// alone can surface zero links. Let the network settle before reading
					// hrefs; fall back to the loaded DOM if it never goes idle.
					await page
						.waitForLoadState("networkidle", { timeout: 5_000 })
						.catch(() => {});
					hrefs = await page.evaluate(() =>
						Array.from(
							document.querySelectorAll<HTMLAnchorElement>("a[href]"),
						).map((a) => a.getAttribute("href") ?? ""),
					);
				}
			} catch {
				// page-level error - skip and continue crawl
			} finally {
				await page.close().catch(() => {});
			}

			record(finalPath);

			if (item.depth >= maxDepth) continue;
			for (const p of extractInternalLinks(base, resolved, hrefs)) {
				if (visited.has(p)) continue;
				visited.add(p);
				queue.push({ url: p, depth: item.depth + 1 });
			}
		}
	};

	try {
		await Promise.all(Array.from({ length: CRAWL_WORKERS }, () => fetchOne()));
	} finally {
		await releaseStableContext(handle);
	}

	return discovered.slice(0, maxRoutes);
}
