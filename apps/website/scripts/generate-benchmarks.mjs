#!/usr/bin/env node
/**
 * Merge the committed benchmark artifacts (`benchmarks/results/<key>.json`,
 * written by `pnpm benchmark <key>`) into `data/benchmarks.json`, keyed by bench,
 * for the /benchmarks page and the homepage teaser to import.
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
const files = fs.existsSync(resultsDir) ? fs.readdirSync(resultsDir) : [];

const artifacts = Object.fromEntries(
	files
		.filter((file) => file.endsWith(".json"))
		.sort()
		.map((file) => {
			const artifact = JSON.parse(
				fs.readFileSync(path.join(resultsDir, file), "utf8"),
			);
			if (artifact.schemaVersion !== SCHEMA_VERSION) {
				throw new Error(
					`${file}: schemaVersion ${artifact.schemaVersion}, expected ${SCHEMA_VERSION}`,
				);
			}
			return [artifact.key, artifact];
		}),
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifacts));
console.log(
	`Wrote ${path.relative(websiteRoot, outPath)} (${Object.keys(artifacts).join(", ") || "no artifacts"})`,
);
