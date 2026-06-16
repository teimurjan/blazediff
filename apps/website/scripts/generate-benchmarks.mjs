#!/usr/bin/env node
/**
 * Mirror the repo's `benchmarks/*.md` into the Nextra site as a "Benchmarks"
 * section, so the generated tables + summary charts ship with every build.
 *
 * For each `benchmarks/<slug>.md` it:
 *   - converts the raw `<table>` blocks to themed GFM tables,
 *   - rewrites `./charts/<slug>.png` refs to the copied `/benchmark-charts/...`,
 *   - writes `app/benchmarks/<slug>/page.mdx`.
 * It also copies `benchmarks/charts/*.png` into `public/benchmark-charts/` and
 * (re)writes the section's `_meta.ts`, `layout.tsx`, and index redirect.
 *
 * Wired into `prebuild`/`predev`; the generated `app/benchmarks/` is gitignored.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(websiteRoot, "../..");
const benchmarksDir = path.join(repoRoot, "benchmarks");
const chartsDir = path.join(benchmarksDir, "charts");
const outDir = path.join(websiteRoot, "app/benchmarks");
const publicChartsDir = path.join(websiteRoot, "public/benchmark-charts");

// Sidebar order + titles. Files not listed here still publish, appended after
// these in alphabetical order with a humanized title.
const TITLES = {
	"pixel-by-pixel": "Pixel by Pixel",
	structural: "Structural",
	object: "Object",
	"png-codec": "PNG Codec",
};

const humanize = (slug) =>
	slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Strip inline HTML inside a table cell down to Markdown. */
function cellToMd(html) {
	return html
		.replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
		.replace(/<\/?[^>]+>/g, "")
		.trim();
}

/** Convert a single `<table>…</table>` block to a GFM table. */
function tableToGfm(tableHtml) {
	const headerCells = [
		...tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi),
	].map((m) => cellToMd(m[1]));
	const rows = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
		.map((tr) => [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cellToMd(c[1])))
		.filter((cells) => cells.length > 0);
	if (!headerCells.length || !rows.length) return tableHtml;

	const line = (cells) => `| ${cells.join(" | ")} |`;
	return [
		line(headerCells),
		line(headerCells.map(() => "---")),
		...rows.map(line),
	].join("\n");
}

/** Transform a benchmark Markdown source for the site. */
function transform(md) {
	let out = md.replace(/<table[\s\S]*?<\/table>/gi, (m) => tableToGfm(m));
	// `./charts/<x>.png` → the copied public asset.
	out = out.replace(
		/\(\.\/charts\/([^)]+)\)/g,
		(_m, file) => `(/benchmark-charts/${file})`,
	);
	return out;
}

function write(file, content) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function main() {
	if (!fs.existsSync(benchmarksDir)) {
		console.warn(`generate-benchmarks: no ${benchmarksDir}; skipping.`);
		return;
	}

	// Reset the generated section so removed sources don't linger.
	fs.rmSync(outDir, { recursive: true, force: true });

	const files = fs
		.readdirSync(benchmarksDir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.replace(/\.md$/, ""));

	const ordered = [
		...Object.keys(TITLES).filter((s) => files.includes(s)),
		...files.filter((s) => !(s in TITLES)).sort(),
	];

	// Copy charts → public.
	fs.rmSync(publicChartsDir, { recursive: true, force: true });
	if (fs.existsSync(chartsDir)) {
		fs.mkdirSync(publicChartsDir, { recursive: true });
		for (const png of fs.readdirSync(chartsDir).filter((f) => f.endsWith(".png"))) {
			fs.copyFileSync(path.join(chartsDir, png), path.join(publicChartsDir, png));
		}
	}

	// Per-benchmark pages.
	for (const slug of ordered) {
		const md = fs.readFileSync(path.join(benchmarksDir, `${slug}.md`), "utf8");
		write(path.join(outDir, slug, "page.mdx"), transform(md));
	}

	// Section scaffolding.
	const meta = [
		"export default {",
		'\tindex: { display: "hidden" },',
		...ordered.map(
			(slug) => `\t${JSON.stringify(slug)}: { title: ${JSON.stringify(TITLES[slug] || humanize(slug))} },`,
		),
		"};",
		"",
	].join("\n");
	write(path.join(outDir, "_meta.ts"), meta);

	write(
		path.join(outDir, "layout.tsx"),
		[
			'import NextraShell from "../../components/landing/nextra-shell";',
			"",
			"export default function BenchmarksLayout({",
			"\tchildren,",
			"}: {",
			"\tchildren: React.ReactNode;",
			"}) {",
			"\treturn <NextraShell>{children}</NextraShell>;",
			"}",
			"",
		].join("\n"),
	);

	write(
		path.join(outDir, "page.tsx"),
		[
			'import { redirect } from "next/navigation";',
			"",
			"export default function BenchmarksPage() {",
			`\tredirect("/benchmarks/${ordered[0]}");`,
			"}",
			"",
		].join("\n"),
	);

	console.log(
		`generate-benchmarks: ${ordered.length} page(s) → app/benchmarks (${ordered.join(", ")}).`,
	);
}

main();
