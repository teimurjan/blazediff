#!/usr/bin/env node
/**
 * Pre-encode the site's static PNG illustrations and logos as AVIF + WebP at
 * the sizes they are actually displayed, so `<Picture>` can serve them through
 * `<picture>`/`<source>` without a runtime image optimizer.
 *
 * For each source in `SOURCES` it writes
 * `public/images/<name>-<w|h><size>.<avif|webp>` (never upscaling) and records
 * the intrinsic size plus every variant in `data/images/manifest.json`, which
 * `components/landing/picture.tsx` imports. Outputs newer than both the source
 * and this script are left alone, so re-runs are near-instant.
 *
 * Wired into `prebuild`/`predev`; both output dirs are gitignored.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptPath = fileURLToPath(import.meta.url);
const websiteRoot = path.resolve(path.dirname(scriptPath), "..");
const publicDir = path.join(websiteRoot, "public");
const outDir = path.join(publicDir, "images");
const manifestPath = path.join(websiteRoot, "data/images/manifest.json");

// Key order is the `<source>` order in `<picture>`: browsers take the first
// type they support, so the smallest format goes first.
const FORMATS = {
	avif: { quality: 60, effort: 4 },
	webp: { quality: 82, effort: 4 },
};

// Illustrations sit in a column that is ≤480 CSS px on desktop and ≤~690 on
// mobile; logos render 48 px tall. Targets cover 1x/2x/3x DPR of that.
const ILLUSTRATION = { axis: "width", targets: [480, 960, 1440] };
const LOGO = { axis: "height", targets: [48, 96, 144] };

const SOURCES = {
	"/home-fast.png": ILLUSTRATION,
	"/home-local.png": ILLUSTRATION,
	"/home-languages.png": ILLUSTRATION,
	"/agent-verdict.png": ILLUSTRATION,
	"/agent-tile.png": ILLUSTRATION,
	"/agent-harnesses.png": ILLUSTRATION,
	"/vitest-logo.png": LOGO,
	"/shopify-logo.png": LOGO,
	"/antdesign-logo.png": LOGO,
	"/antv-logo.png": LOGO,
	"/antx-logo.png": LOGO,
	"/gptvis-logo.png": LOGO,
	"/vega-logo.png": LOGO,
	"/apexcharts-logo.png": LOGO,
	"/avatune-logo.png": LOGO,
	// Nav renders it at 32 px, the Nextra navbar at 48 px.
	"/logo.png": { axis: "height", targets: [32, 48, 64, 96, 144] },
};

const scriptMtime = fs.statSync(scriptPath).mtimeMs;
const counts = { encoded: 0, upToDate: 0 };

async function encodeVariant(file, staleAfter, axis, size, format) {
	const name = path.basename(file, ".png");
	const out = path.join(outDir, `${name}-${axis[0]}${size}.${format}`);
	const existing = fs.statSync(out, { throwIfNoEntry: false });

	if (existing && existing.mtimeMs >= staleAfter) {
		counts.upToDate++;
		const { width } = await sharp(out).metadata();
		return { width, src: `/images/${path.basename(out)}` };
	}

	const { width } = await sharp(file)
		.resize({ [axis]: size })
		.toFormat(format, FORMATS[format])
		.toFile(out);
	counts.encoded++;
	return { width, src: `/images/${path.basename(out)}` };
}

async function processSource([src, { axis, targets }]) {
	const file = path.join(publicDir, src);
	const staleAfter = Math.max(fs.statSync(file).mtimeMs, scriptMtime);
	const meta = await sharp(file).metadata();
	const sizes = [...new Set(targets.map((t) => Math.min(t, meta[axis])))];

	const variants = {};
	for (const format of Object.keys(FORMATS)) {
		variants[format] = [];
		for (const size of sizes) {
			variants[format].push(
				await encodeVariant(file, staleAfter, axis, size, format),
			);
		}
	}

	return [src, { width: meta.width, height: meta.height, variants }];
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

	const entries = await Promise.all(Object.entries(SOURCES).map(processSource));
	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify(Object.fromEntries(entries), null, "\t")}\n`,
	);

	console.log(
		`generate-images: ${counts.encoded} encoded, ${counts.upToDate} up to date → public/images (${entries.length} sources).`,
	);
}

await main();
