import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DiscoveredRoute } from "../types";

interface RoutesManifest {
	staticRoutes?: Array<{ page: string }>;
	dynamicRoutes?: Array<{ page: string }>;
}

type AppPathsManifest = Record<string, string>;

const DYNAMIC_SEGMENT = /\[[^\]]+\]/;

async function readJson<T>(file: string): Promise<T | null> {
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch {
		return null;
	}
}

function isPublicRoute(route: string): boolean {
	if (DYNAMIC_SEGMENT.test(route)) return false;
	if (route === "/api" || route.startsWith("/api/")) return false;
	return true;
}

export async function discoverFromNextManifest(
	cwd: string = process.cwd(),
): Promise<DiscoveredRoute[]> {
	const nextDir = path.join(cwd, ".next");
	if (!existsSync(nextDir)) return [];

	const seen = new Set<string>();
	const out: DiscoveredRoute[] = [];
	const add = (url: string) => {
		if (seen.has(url)) return;
		seen.add(url);
		out.push({ url, source: "next-manifest" });
	};

	const routes = await readJson<RoutesManifest>(
		path.join(nextDir, "routes-manifest.json"),
	);
	for (const r of routes?.staticRoutes ?? []) {
		if (isPublicRoute(r.page)) add(r.page);
	}

	const appPaths = await readJson<AppPathsManifest>(
		path.join(nextDir, "server", "app-paths-manifest.json"),
	);
	for (const route of Object.keys(appPaths ?? {})) {
		const normalized = route.replace(/\/page$/, "") || "/";
		if (isPublicRoute(normalized)) add(normalized);
	}

	return out;
}
