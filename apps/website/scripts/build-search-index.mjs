#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pagefind from "pagefind";

const websiteRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const serverDir = path.join(websiteRoot, ".next/server");
const outputPath = path.join(websiteRoot, "public/_pagefind");

const LEGACY_APP_DIR = `${path.sep}app${path.sep}`;
const ADAPTER_ROUTE_MARKER = `${path.sep}$${path.sep}`;

const toRoute = (relativeHtmlPath) => {
	const route = `/${relativeHtmlPath.split(path.sep).join("/").replace(/\.html$/, "")}`;
	return route === "/index" ? "/" : route;
};

const routeOf = (htmlPath) => {
	const relative = htmlPath.slice(serverDir.length);
	const adapterAt = relative.lastIndexOf(ADAPTER_ROUTE_MARKER);
	if (adapterAt !== -1) {
		return toRoute(relative.slice(adapterAt + ADAPTER_ROUTE_MARKER.length));
	}
	if (relative.startsWith(LEGACY_APP_DIR)) {
		return toRoute(relative.slice(LEGACY_APP_DIR.length));
	}
	return null;
};

const pages = fs
	.readdirSync(serverDir, { recursive: true })
	.filter((entry) => entry.endsWith(".html"))
	.map((entry) => path.join(serverDir, entry))
	.map((htmlPath) => ({ htmlPath, route: routeOf(htmlPath) }))
	.filter(({ route }) => route !== null && !route.startsWith("/_"));

const fail = (message) => {
	console.error(`build-search-index: ${message}`);
	process.exit(1);
};

if (pages.length === 0) {
	fail(`no prerendered HTML found under ${serverDir}`);
}

const { index, errors: createErrors } = await pagefind.createIndex();
if (!index) fail(createErrors.join("\n"));

for (const { htmlPath, route } of pages) {
	const { errors } = await index.addHTMLFile({
		url: route,
		content: fs.readFileSync(htmlPath, "utf8"),
	});
	if (errors.length > 0) fail(`${route}: ${errors.join("\n")}`);
}

fs.rmSync(outputPath, { recursive: true, force: true });
const { errors: writeErrors } = await index.writeFiles({ outputPath });
if (writeErrors.length > 0) fail(writeErrors.join("\n"));

await pagefind.close();
console.log(`build-search-index: indexed ${pages.length} pages`);
