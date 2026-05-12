import type { DiscoveredRoute } from "../types";

const CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml"];
const LOC_RE = /<loc>([^<]+)<\/loc>/g;

export async function discoverFromSitemap(
	baseUrl: string,
): Promise<DiscoveredRoute[]> {
	for (const candidate of CANDIDATES) {
		try {
			const res = await fetch(new URL(candidate, baseUrl));
			if (!res.ok) continue;
			const text = await res.text();
			const urls = Array.from(text.matchAll(LOC_RE)).map((m) => m[1]);
			if (!urls.length) continue;
			return urls.map((u) => {
				const url = new URL(u);
				return { url: url.pathname + url.search, source: "sitemap" };
			});
		} catch {
			// try next candidate
		}
	}
	return [];
}
