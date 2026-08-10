import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { SITE_URL } from "../utils/site";

const APP_DIR = path.join(process.cwd(), "app");

/** Index routes that only call `redirect()`; a sitemap must list destinations. */
const REDIRECT_ONLY = new Set(["/docs", "/apis", "/benchmarks", "/guides"]);

function hasPage(dir: string) {
	return (
		fs.existsSync(path.join(dir, "page.tsx")) ||
		fs.existsSync(path.join(dir, "page.mdx"))
	);
}

function collectRoutes(dir: string, base = ""): string[] {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
		.flatMap((entry) => {
			const child = path.join(dir, entry.name);
			const route = `${base}/${entry.name}`;
			return [
				...(hasPage(child) ? [route] : []),
				...collectRoutes(child, route),
			];
		});
}

// Read from disk rather than a hardcoded list so generated pages (app/benchmarks
// is written by scripts/generate-benchmarks.mjs on prebuild) stay covered.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
	const routes = ["/", ...collectRoutes(APP_DIR)].filter(
		(route) => !REDIRECT_ONLY.has(route),
	);

	return routes.map((route) => ({
		url: route === "/" ? SITE_URL : `${SITE_URL}${route}`,
		priority: route === "/" ? 1 : 0.7,
	}));
}
