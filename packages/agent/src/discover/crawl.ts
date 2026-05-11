import { getBrowser } from "../browser/launch";
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
			// malformed href — skip
		}
	}
	return out;
}

export async function crawlRoutes(
	opts: CrawlOptions,
): Promise<DiscoveredRoute[]> {
	const maxRoutes = opts.maxRoutes ?? 50;
	const maxDepth = opts.maxDepth ?? 2;
	const base = new URL(opts.baseUrl);
	const visited = new Set<string>();
	const queue: QueueItem[] = [{ url: "/", depth: 0 }];
	visited.add("/");
	const discovered: DiscoveredRoute[] = [];

	const browser = await getBrowser();
	const context = await browser.newContext({
		viewport: { width: 1024, height: 768 },
		deviceScaleFactor: 1,
	});

	try {
		while (queue.length && discovered.length < maxRoutes) {
			const { url, depth } = queue.shift() as QueueItem;
			const page = await context.newPage();
			try {
				const target = new URL(url, base).toString();
				await page.goto(target, {
					waitUntil: "domcontentloaded",
					timeout: 15_000,
				});
				discovered.push({ url, source: "crawl" });

				if (depth >= maxDepth) continue;
				const hrefs = await page.evaluate(() =>
					Array.from(
						document.querySelectorAll<HTMLAnchorElement>("a[href]"),
					).map((a) => a.getAttribute("href") ?? ""),
				);
				for (const path of extractInternalLinks(base, target, hrefs)) {
					if (visited.has(path)) continue;
					visited.add(path);
					queue.push({ url: path, depth: depth + 1 });
				}
			} catch {
				// page-level error — skip and continue crawl
			} finally {
				await page.close().catch(() => {});
			}
		}
	} finally {
		await context.close().catch(() => {});
	}

	return discovered;
}
