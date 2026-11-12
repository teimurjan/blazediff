import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { PLATFORMS } from "../components/benchmarks/artifacts";
import { SITE_URL } from "../utils/site";

const APP_DIR = path.join(process.cwd(), "app");

/** Index routes that only call `redirect()`; a sitemap must list destinations. */
const REDIRECT_ONLY = new Set(["/apis", "/guides", "/vs"]);

function hasPage(dir: string) {
	return (
		fs.existsSync(path.join(dir, "page.tsx")) ||
		fs.existsSync(path.join(dir, "page.mdx"))
	);
}

function collectRoutes(dir: string, base = ""): string[] {
	return (
		fs
			.readdirSync(dir, { withFileTypes: true })
			// Dynamic segments are not routes; their pages are listed where they are known.
			.filter((entry) => entry.isDirectory() && !/^[_[]/.test(entry.name))
			.flatMap((entry) => {
				const child = path.join(dir, entry.name);
				const route = `${base}/${entry.name}`;
				return [
					...(hasPage(child) ? [route] : []),
					...collectRoutes(child, route),
				];
			})
	);
}

// Read from disk rather than a hardcoded list so new pages stay covered.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
	const routes = [
		"/",
		...collectRoutes(APP_DIR),
		...PLATFORMS.slice(1).map((platform) => `/benchmarks/${platform}`),
	].filter((route) => !REDIRECT_ONLY.has(route));

	return routes.map((route) => ({
		url: route === "/" ? SITE_URL : `${SITE_URL}${route}`,
		priority: route === "/" ? 1 : 0.7,
	}));
}
