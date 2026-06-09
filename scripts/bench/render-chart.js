#!/usr/bin/env node
/**
 * Render a per-target summary chart PNG for the BlazeDiff benchmark suite.
 *
 * Each target gets one or more groups; each group has 2+ bars showing the
 * total time spent (sum of mean latencies over the fixtures the group's bars
 * share). Bars are sourced from the per-fixture ms columns of the `<table>`
 * blocks in the target Markdown file. The markdown is the single source of
 * truth here: `update-benchmarks-md.js` runs first (writing fresh values from
 * tinybench JSON), then `render-chart.js` reads those values back. This is
 * deliberately decoupled from raw JSON because pair JSONs share filenames
 * (e.g. `blazediff.json` is overwritten by every right-side bench run), so a
 * cross-pair chart can't reliably tell whose JSON is fresh.
 *
 * Usage:
 *   node .claude/skills/bench/render-chart.js --target pixel-by-pixel
 *   node .claude/skills/bench/render-chart.js --target structural
 *   node .claude/skills/bench/render-chart.js --target object
 */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { PAIRS } = require("./pairs.js");

const REPO_ROOT = path.resolve(__dirname, "../..");

// @napi-rs/canvas isn't a root dependency; it's installed under the website
// workspace. Resolve it from there so the skill works without adding a new
// root dep.
const canvasResolveBase = path.join(REPO_ROOT, "apps/website");
const canvasModulePath = require.resolve("@napi-rs/canvas", {
	paths: Module._nodeModulePaths(canvasResolveBase),
});
const { createCanvas, GlobalFonts } = require(canvasModulePath);

const PALETTE = {
	accent: "#ff7a1a",
	accentShadow: "#c95a10",
	magenta: "#ff2e8b",
	magentaShadow: "#a31e5b",
	muted: "#7a7585",
	mutedShadow: "#3a3744",
	fg: "#f0ece8",
	line: "#2a2a38",
};

// --- group registry ---
// Each bar resolves to a (pair, variant, side) triple. "variant" indexes
// pair.variants (or 0 for single-variant pairs). The renderer loads
// per-fixture mean latencies for each triple, intersects fixture sets within
// a group, and sums the latencies of each bar over that intersection.
const GROUPS = {
	"pixel-by-pixel": [
		{
			label: "JavaScript (image IO excluded)",
			bars: [
				{
					name: "pixelmatch",
					pair: "core",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "@blazediff/core",
					pair: "core",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
				{
					name: "@blazediff/core-wasm",
					pair: "core-wasm",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
		{
			label: "JavaScript Native Binary (image IO included)",
			bars: [
				{
					name: "odiff",
					pair: "core-native",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "@blazediff/core-native",
					pair: "core-native",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
		{
			label: "Python (image IO included)",
			bars: [
				{
					name: "pixelmatch (PyPI)",
					pair: "python-pixelmatch",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "opencv-python",
					pair: "python-opencv",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "blazediff (PyO3)",
					pair: "python-pixelmatch",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
	],
	structural: [
		{
			label: "SSIM (fast / original)",
			bars: [
				{
					name: "ssim.js (fast)",
					pair: "ssim",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "@blazediff/ssim (ssim)",
					pair: "ssim",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
		{
			label: "Hitchhikers SSIM (Weber)",
			bars: [
				{
					name: "ssim.js (weber)",
					pair: "hitchhikers-ssim",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "@blazediff/ssim (hitchhikers)",
					pair: "hitchhikers-ssim",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
	],
	object: [
		{
			label: "Plain JS object diff",
			bars: [
				{
					name: "microdiff",
					pair: "object",
					variant: 0,
					side: "left",
					role: "competitor",
				},
				{
					name: "@blazediff/object",
					pair: "object",
					variant: 0,
					side: "right",
					role: "blazediff",
				},
			],
		},
	],
};

const TARGET_TITLES = {
	"pixel-by-pixel": {
		title: "Pixel By Pixel",
		subtitle: "Total time per implementation (lower is better)",
	},
	structural: {
		title: "Structural Similarity",
		subtitle: "Total time per implementation (lower is better)",
	},
	object: {
		title: "Object Diffing",
		subtitle: "Total time per implementation (lower is better)",
	},
};

function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const k = a.replace(/^--/, "");
		const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
		out[k] = v;
	}
	return out;
}

// --- data loading ---

function variantOf(pair, idx) {
	if (Array.isArray(pair.variants) && pair.variants.length > 0) {
		return pair.variants[idx];
	}
	return {
		section: pair.section,
		leftTaskPrefix: pair.left.taskPrefix,
		rightTaskPrefix: pair.right.taskPrefix,
	};
}

function mdRefForBar(bar) {
	const pair = PAIRS[bar.pair];
	if (!pair) throw new Error(`Unknown pair: ${bar.pair}`);
	const variant = variantOf(pair, bar.variant);
	return {
		mdPath: path.join(REPO_ROOT, pair.targetFile),
		section: variant.section,
		columnIndex: bar.side === "left" ? 1 : 2,
	};
}

/**
 * Parse a `<td>2.40s</td>` / `<td>349.90ms</td>` / `<td>0.0040ms</td>` style
 * cell back into a number of milliseconds.
 */
function parseMs(cell) {
	const s = cell.trim();
	const m = /^([0-9]*\.?[0-9]+)\s*(ms|s|µs|us)$/.exec(s);
	if (!m) return null;
	const v = parseFloat(m[1]);
	if (Number.isNaN(v)) return null;
	const unit = m[2];
	if (unit === "s") return v * 1000;
	if (unit === "µs" || unit === "us") return v / 1000;
	return v;
}

function loadMarkdownLatencies(mdPath, sectionHeading, columnIndex) {
	if (!fs.existsSync(mdPath)) return null;
	const md = fs.readFileSync(mdPath, "utf8");
	const headingRe = new RegExp(
		`^(#{2,})[ \\t]+${sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`,
		"m",
	);
	const m = headingRe.exec(md);
	if (!m) return null;
	const depth = m[1].length;
	const startBody = m.index + m[0].length;
	const after = md.slice(startBody);
	const endRe = new RegExp(`^#{1,${depth}}[ \\t]+\\S`, "m");
	const endMatch = endRe.exec(after);
	const sectionBody = endMatch != null ? after.slice(0, endMatch.index) : after;
	const tableMatch = /<table[\s\S]*?<\/table>/.exec(sectionBody);
	if (!tableMatch) return null;
	const map = new Map();
	const trRe = /<tr>([\s\S]*?)<\/tr>/g;
	let tr;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
	while ((tr = trRe.exec(tableMatch[0])) !== null) {
		const tds = [...tr[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) =>
			c[1].trim(),
		);
		if (tds.length < 5) continue;
		const ms = parseMs(tds[columnIndex]);
		if (ms != null) map.set(tds[0], ms);
	}
	return map.size ? map : null;
}

function loadBarLatencies(bar) {
	const ref = mdRefForBar(bar);
	const fromMd = loadMarkdownLatencies(
		ref.mdPath,
		ref.section,
		ref.columnIndex,
	);
	if (fromMd) return { latencies: fromMd };
	return null;
}

function collectGroupData(target) {
	const groups = GROUPS[target];
	if (!groups) throw new Error(`Unknown target: ${target}`);

	const skipped = [];
	const resolved = [];

	for (const group of groups) {
		const bars = [];
		for (const bar of group.bars) {
			const result = loadBarLatencies(bar);
			if (!result) {
				skipped.push({ group: group.label, bar: bar.name });
				continue;
			}
			bars.push({ ...bar, latencies: result.latencies });
		}
		if (bars.length < 2) {
			skipped.push({
				group: group.label,
				bar: "<group dropped — fewer than 2 bars resolved>",
			});
			continue;
		}

		// Intersect fixture sets so each bar's total is comparable.
		let intersection = null;
		for (const b of bars) {
			const keys = new Set(b.latencies.keys());
			intersection =
				intersection == null
					? keys
					: new Set([...intersection].filter((k) => keys.has(k)));
		}
		if (!intersection || intersection.size === 0) {
			skipped.push({ group: group.label, bar: "<no overlapping fixtures>" });
			continue;
		}

		const totals = bars.map((b) => {
			let total = 0;
			for (const k of intersection) total += b.latencies.get(k);
			return { name: b.name, role: b.role, totalMs: total };
		});
		resolved.push({
			label: group.label,
			fixtureCount: intersection.size,
			bars: totals,
		});
	}

	return { groups: resolved, skipped };
}

// --- drawing ---

function tryRegisterMonoFont() {
	const candidates = [
		"/System/Library/Fonts/SFNSMono.ttf",
		"/Library/Fonts/JetBrainsMono-Regular.ttf",
		path.join(
			REPO_ROOT,
			"apps/website/node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf",
		),
	];
	for (const p of candidates) {
		if (fs.existsSync(p)) {
			try {
				GlobalFonts.registerFromPath(p, "BenchMono");
				return "BenchMono";
			} catch {}
		}
	}
	return "monospace";
}

function formatMs(ms) {
	if (ms >= 60000) return `${(ms / 60000).toFixed(2)}min`;
	if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
	if (ms >= 10) return `${ms.toFixed(0)}ms`;
	if (ms >= 1) return `${ms.toFixed(2)}ms`;
	return `${ms.toFixed(3)}ms`;
}

function colorsForRole(role) {
	if (role === "blazediff") {
		return { fill: PALETTE.accent, shadow: PALETTE.accentShadow };
	}
	if (role === "competitor-2") {
		return { fill: PALETTE.magenta, shadow: PALETTE.magentaShadow };
	}
	return { fill: PALETTE.muted, shadow: PALETTE.mutedShadow };
}

function drawVoxelBar(ctx, x, y, w, h, fillColor, shadowColor) {
	const VOX = 12;
	x = Math.round(x);
	y = Math.round(y);
	w = Math.round(Math.max(VOX, w));
	h = Math.round(h);

	ctx.fillStyle = fillColor;
	ctx.fillRect(x, y, w, h);

	ctx.fillStyle = shadowColor;
	ctx.fillRect(x, y + h - VOX, w, VOX);
	ctx.fillRect(x + w - VOX, y, VOX, h);

	ctx.fillStyle = PALETTE.line;
	for (let gx = x + VOX; gx < x + w; gx += VOX) ctx.fillRect(gx, y, 1, h);
	for (let gy = y + VOX; gy < y + h; gy += VOX) ctx.fillRect(x, gy, w, 1);

	ctx.strokeStyle = PALETTE.line;
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawGroupedChart(groups, opts) {
	const { title, subtitle, outPath } = opts;
	const W = 1600;
	const PADDING_X = 80;
	const HEADER_H = 220;

	// Per-bar height and per-group spacing.
	const ROW = 64;
	const GROUP_LABEL_H = 56;
	const GROUP_GAP = 36;
	const FOOTER_H = 120;

	// Compute canvas height from row count + headers.
	const totalRows = groups.reduce((s, g) => s + g.bars.length, 0);
	const groupOverhead = groups.length * (GROUP_LABEL_H + GROUP_GAP);
	const H = HEADER_H + totalRows * ROW + groupOverhead + FOOTER_H;

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");
	const font = tryRegisterMonoFont();

	// Header
	ctx.fillStyle = PALETTE.fg;
	ctx.font = `64px ${font}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(title.toUpperCase(), PADDING_X, 80);

	ctx.fillStyle = PALETTE.muted;
	ctx.font = `24px ${font}`;
	ctx.fillText(subtitle.toUpperCase(), PADDING_X, 160);

	// Chart area
	const labelColW = 460;
	const chartLeft = PADDING_X + labelColW;
	const chartRight = W - 240;
	const chartW = chartRight - chartLeft;

	let y = HEADER_H;
	for (const group of groups) {
		// Group label row
		ctx.fillStyle = PALETTE.fg;
		ctx.font = `bold 26px ${font}`;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillText(group.label.toUpperCase(), PADDING_X, y + GROUP_LABEL_H / 2);

		// Fixture count caption
		ctx.fillStyle = PALETTE.muted;
		ctx.font = `18px ${font}`;
		ctx.fillText(
			`${group.fixtureCount} fixtures, summed`,
			PADDING_X,
			y + GROUP_LABEL_H / 2 + 24,
		);

		// Group baseline + vertical rule at chartLeft
		ctx.strokeStyle = PALETTE.line;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(chartLeft, y + 8);
		ctx.lineTo(chartLeft, y + GROUP_LABEL_H + group.bars.length * ROW + 4);
		ctx.stroke();

		y += GROUP_LABEL_H;

		// Per-group max for bar scaling
		const max = Math.max(...group.bars.map((b) => b.totalMs)) || 1;

		for (const bar of group.bars) {
			const yCenter = y + ROW / 2;
			const barH = 36;
			const yTop = Math.round(yCenter - barH / 2);

			// Bar label
			ctx.fillStyle = PALETTE.fg;
			ctx.font = `20px ${font}`;
			ctx.textAlign = "right";
			ctx.textBaseline = "middle";
			ctx.fillText(bar.name.toUpperCase(), chartLeft - 24, yCenter);

			// Bar
			const w = (bar.totalMs / max) * chartW;
			const { fill, shadow } = colorsForRole(bar.role);
			drawVoxelBar(ctx, chartLeft, yTop, w, barH, fill, shadow);

			// Time label to the right of the bar
			ctx.fillStyle = PALETTE.fg;
			ctx.font = `bold 22px ${font}`;
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText(formatMs(bar.totalMs), chartLeft + w + 14, yCenter);

			y += ROW;
		}

		y += GROUP_GAP;
	}

	// Footer
	ctx.fillStyle = PALETTE.muted;
	ctx.font = `18px ${font}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(
		"LOWER IS BETTER  |  ORANGE = BLAZEDIFF  |  GREY = COMPETITOR  |  MAGENTA = SECONDARY COMPETITOR",
		PADDING_X,
		H - FOOTER_H + 40,
	);

	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
}

function render({ target }) {
	const meta = TARGET_TITLES[target];
	if (!meta) throw new Error(`Unknown target: ${target}`);

	const { groups, skipped } = collectGroupData(target);
	for (const s of skipped)
		console.warn(`render-chart: skip "${s.group}" / ${s.bar}`);

	if (!groups.length) throw new Error(`No groups resolved for "${target}"`);

	const outPath = path.join(REPO_ROOT, "benchmarks/charts", `${target}.png`);
	drawGroupedChart(groups, {
		title: meta.title,
		subtitle: meta.subtitle,
		outPath,
	});

	return {
		outPath,
		groups: groups.length,
		bars: groups.reduce((s, g) => s + g.bars.length, 0),
	};
}

function main() {
	const args = parseArgs(process.argv);
	const target = args.target;
	if (!target) {
		console.error(
			"Usage: node render-chart.js --target <pixel-by-pixel|structural|object>",
		);
		process.exit(2);
	}
	const result = render({ target });
	console.log(
		`render-chart: wrote ${path.relative(REPO_ROOT, result.outPath)} (${result.groups} groups, ${result.bars} bars).`,
	);
}

if (require.main === module) main();
module.exports = { render };
