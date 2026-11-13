#!/usr/bin/env node
/**
 * Merge the committed benchmark artifacts
 * (`benchmarks/results/<platform>/<key>.json`, written by `pnpm benchmark <key>`)
 * into `data/benchmarks.json`, keyed by platform and then bench, for the
 * /benchmarks pages and the homepage teaser to import.
 *
 * Wired into `prebuild`/`predev`; `data/` is gitignored.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(__dirname, "..");
const resultsDir = path.resolve(websiteRoot, "../../benchmarks/results");
const outPath = path.join(websiteRoot, "data/benchmarks.json");

// A checkout without results still builds; the pages skip what is missing.
const platforms = fs.existsSync(resultsDir)
	? fs
			.readdirSync(resultsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort()
	: [];

function readPlatform(platform) {
	const dir = path.join(resultsDir, platform);
	const entries = fs
		.readdirSync(dir)
		.filter((file) => file.endsWith(".json"))
		.sort()
		.map((file) => {
			const artifact = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
			if (artifact.schemaVersion !== SCHEMA_VERSION) {
				throw new Error(
					`${platform}/${file}: schemaVersion ${artifact.schemaVersion}, expected ${SCHEMA_VERSION}`,
				);
			}
			return [artifact.key, artifact];
		});
	return Object.fromEntries(entries);
}

const artifacts = Object.fromEntries(
	platforms.map((platform) => [platform, readPlatform(platform)]),
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifacts));
const summary = platforms
	.map((p) => `${p}: ${Object.keys(artifacts[p]).join(", ")}`)
	.join("; ");
console.log(
	`Wrote ${path.relative(websiteRoot, outPath)} (${summary || "no artifacts"})`,
);
