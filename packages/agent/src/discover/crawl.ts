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

	const handle = await acquireStableContext(CRAWL_VIEWPORT);

	const fetchOne = async (): Promise<void> => {
		while (queue.length && discovered.length < maxRoutes) {
			const item = queue.shift();
			if (!item) return;
			if (discovered.length >= maxRoutes) return;
			discovered.push({ url: item.url, source: "crawl" });

			if (item.depth >= maxDepth) continue;
			const page = await handle.context.newPage();
			try {
				const target = new URL(item.url, base).toString();
				await page.goto(target, {
					waitUntil: "domcontentloaded",
					timeout: 15_000,
				});
				const hrefs = await page.evaluate(() =>
					Array.from(
						document.querySelectorAll<HTMLAnchorElement>("a[href]"),
					).map((a) => a.getAttribute("href") ?? ""),
				);
				for (const p of extractInternalLinks(base, target, hrefs)) {
					if (visited.has(p)) continue;
					visited.add(p);
					queue.push({ url: p, depth: item.depth + 1 });
				}
			} catch {
				// page-level error - skip and continue crawl
			} finally {
				await page.close().catch(() => {});
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
