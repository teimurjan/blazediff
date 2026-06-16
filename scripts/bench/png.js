#!/usr/bin/env node
/**
 * Orchestrate the blazediff-png codec benchmark and render it into the same
 * Markdown + chart style as the JS benchmark suite.
 *
 * Pipeline:
 *   1. Run the Rust benchmark (`blazediff-png-benchmark`) with `--json`, which
 *      times decode + encode + encoded size for every fixture across
 *      blazediff / spng / image-rs / zune.
 *   2. Write `benchmarks/png-codec.md` (intro, chart ref, decode/encode/size
 *      tables) in the existing HTML-table style.
 *   3. Render `benchmarks/charts/png-codec.png` (decode + encode groups) by
 *      reusing the shared chart renderer.
 *
 * Usage (from repo root):
 *   node scripts/bench/png.js                 # build + run, then regenerate
 *   node scripts/bench/png.js --skip-run      # reuse the last JSON
 *   node scripts/bench/png.js --json <path>   # read/write a specific JSON
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { drawGroupedChart } = require("./render-chart.js");

const REPO_ROOT = path.resolve(__dirname, "../..");
const CRATES_DIR = path.join(REPO_ROOT, "crates");
const MD_PATH = path.join(REPO_ROOT, "benchmarks/png-codec.md");
const CHART_PATH = path.join(REPO_ROOT, "benchmarks/charts/png-codec.png");

// Per-competitor display names and chart roles (colors), keyed by the codec
// order the Rust binary emits in `names`.
const ROLES = {
	blazediff: "blazediff",
	spng: "competitor",
	"image-rs": "competitor-2",
	zune: "competitor-3",
};
const LEGEND =
	"LOWER IS BETTER  |  ORANGE = BLAZEDIFF  |  GREY = SPNG  |  MAGENTA = IMAGE-RS  |  CYAN = ZUNE";

function parseArgs(argv) {
	const flags = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const k = a.replace(/^--/, "");
		const next = argv[i + 1];
		if (next == null || next.startsWith("--")) flags[k] = true;
		else (flags[k] = next), i++;
	}
	return flags;
}

function runBenchmark(jsonPath) {
	const cmd = `cargo run --release -p blazediff-png-benchmark -- --json ${JSON.stringify(jsonPath)}`;
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: "inherit", cwd: CRATES_DIR });
}

// --- markdown ---------------------------------------------------------------

const fmtMs = (v) => `${v.toFixed(2)}ms`;
const fmtKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const fmtPct = (v) => `${v.toFixed(1)}%`;

function htmlTable(head, rows) {
	const lines = ["<table>", "  <thead>", "    <tr>"];
	for (const h of head) lines.push(`      <th width="500">${h}</th>`);
	lines.push("    </tr>", "  </thead>", "  <tbody>");
	for (const r of rows) {
		lines.push("    <tr>");
		for (const cell of r) lines.push(`      <td>${cell}</td>`);
		lines.push("    </tr>");
	}
	lines.push("  </tbody>", "</table>");
	return lines.join("\n");
}

// A decode/encode timing table: one row per fixture plus a bold TOTAL, with a
// trailing "blazediff vs spng" % column tying back to the headline ratio.
function timingTable(data, pick) {
	const { names, rows } = data;
	const bdIdx = names.indexOf("blazediff");
	const spngIdx = names.indexOf("spng");
	const head = ["Benchmark", "MPx", ...names, "BlazeDiff vs spng"];
	const totals = names.map(() => 0);
	const body = rows.map((r) => {
		const vals = pick(r);
		vals.forEach((v, i) => {
			totals[i] += v;
		});
		const pct = vals[spngIdx]
			? ((vals[spngIdx] - vals[bdIdx]) / vals[spngIdx]) * 100
			: 0;
		return [r.name, r.mpx.toFixed(1), ...vals.map(fmtMs), fmtPct(pct)];
	});
	const totalPct = totals[spngIdx]
		? ((totals[spngIdx] - totals[bdIdx]) / totals[spngIdx]) * 100
		: 0;
	body.push([
		"<strong>TOTAL</strong>",
		"",
		...totals.map((t) => `<strong>${fmtMs(t)}</strong>`),
		`<strong>${fmtPct(totalPct)}</strong>`,
	]);
	return { html: htmlTable(head, body), totals, bdIdx, spngIdx };
}

function sizeTable(data, pick, baseline = "spng") {
	const { names, rows } = data;
	const baseIdx = names.indexOf(baseline);
	const head = ["Benchmark", ...names];
	const totals = names.map(() => 0);
	const body = rows.map((r) => {
		const vals = pick(r);
		vals.forEach((v, i) => {
			totals[i] += v;
		});
		return [r.name, ...vals.map(fmtKb)];
	});
	body.push([
		"<strong>TOTAL</strong>",
		...totals.map((t) => `<strong>${fmtKb(t)}</strong>`),
	]);
	body.push([
		`<strong>vs ${baseline}</strong>`,
		...totals.map(
			(t) => `<strong>${fmtPct((t / totals[baseIdx]) * 100)}</strong>`,
		),
	]);
	return htmlTable(head, body);
}

function ratio(totals, bdIdx, spngIdx) {
	return totals[spngIdx] / totals[bdIdx];
}

// "blazediff libdeflate 6 · spng zlib 4 · image-rs flate2 4 · zune stored"
function levelNote(names, levels) {
	return names.map((n, i) => `${n} ${levels[i]}`).join(" · ");
}

// A full encode section (heading, level note, ratio blockquote, timing table,
// size table) for one compression mode.
function encodeSection(data, mode) {
	const { encNick, label, encPick, sizePick, levels } = mode;
	const t = timingTable(data, encPick);
	const x = ratio(t.totals, t.bdIdx, t.spngIdx);
	return [
		`## Encode — ${label}`,
		"",
		`_Levels: ${levelNote(data.names, levels)}._`,
		"",
		`> blazediff encodes **~${x.toFixed(2)}×** faster than spng (${encNick}) across the corpus.`,
		"",
		t.html,
		"",
		`### Encode Size — ${label}`,
		"",
		"> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output — far larger than the rest.",
		"",
		sizeTable(data, sizePick),
		"",
	].join("\n");
}

function buildMarkdown(data) {
	const decode = timingTable(data, (r) => r.dec);
	const totalMpx = data.rows.reduce((s, r) => s + r.mpx, 0);
	const decX = ratio(decode.totals, decode.bdIdx, decode.spngIdx);

	return `${[
		"# PNG Codec Benchmarks",
		"",
		`A from-scratch PNG codec in Rust — \`blazediff-png\` — against [spng](https://libspng.org), image-rs (\`png\`), and [zune-png](https://github.com/etemesi254/zune-image). Decode and encode are timed (best-of, size-scaled iteration counts) over the full fixture corpus (${data.rows.length} PNGs, ${totalMpx.toFixed(1)} MPx), single-threaded on Apple Silicon. Lower is better.`,
		"",
		"Encode is measured at two settings so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly: **no compression** (stored deflate blocks) and **half compression** (half of each codec's own max deflate level — libdeflate 12 → 6, zlib 9 → 4).",
		"",
		"![PNG codec summary](./charts/png-codec.png)",
		"",
		"## Decode",
		"",
		`> blazediff decodes **~${decX.toFixed(2)}×** faster than spng across the corpus.`,
		"",
		decode.html,
		"",
		encodeSection(data, {
			label: "No Compression",
			encNick: "stored",
			encPick: (r) => r.encNone,
			sizePick: (r) => r.sizeNone,
			levels: data.encodeLevels.none,
		}),
		encodeSection(data, {
			label: "Half Compression",
			encNick: "zlib 4",
			encPick: (r) => r.encHalf,
			sizePick: (r) => r.sizeHalf,
			levels: data.encodeLevels.half,
		}),
	].join("\n")}`;
}

// --- chart ------------------------------------------------------------------

function formatBytes(bytes) {
	const kb = bytes / 1024;
	if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`;
	if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
	return `${kb.toFixed(0)} KB`;
}

function buildGroups(data) {
	const { names, rows } = data;
	// `format` overrides the bar-value formatter (size groups label bytes).
	const group = (label, pick, format) => ({
		label,
		fixtureCount: rows.length,
		...(format ? { format } : {}),
		bars: names.map((name, i) => ({
			name,
			role: ROLES[name] || "competitor",
			totalMs: rows.reduce((s, r) => s + pick(r)[i], 0),
		})),
	});
	return [
		group("Decode (PNG → RGBA8)", (r) => r.dec),
		group("Encode — no compression (stored)", (r) => r.encNone),
		group("Encode — half compression", (r) => r.encHalf),
		group("Encode size — half compression", (r) => r.sizeHalf, formatBytes),
	];
}

function main() {
	const flags = parseArgs(process.argv);
	const jsonPath = flags.json
		? path.resolve(REPO_ROOT, flags.json)
		: path.join(os.tmpdir(), "blazediff-png-bench.json");

	if (!flags["skip-run"]) runBenchmark(jsonPath);
	if (!fs.existsSync(jsonPath)) {
		console.error(`Missing benchmark JSON: ${jsonPath}`);
		process.exit(1);
	}
	const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

	fs.writeFileSync(MD_PATH, buildMarkdown(data));
	console.log(
		`\n${path.relative(REPO_ROOT, MD_PATH)} written (${data.rows.length} fixtures).`,
	);

	drawGroupedChart(buildGroups(data), {
		title: "PNG Codec",
		subtitle:
			"Total time, then output size, per codec across the corpus (lower is better)",
		outPath: CHART_PATH,
		legend: LEGEND,
	});
	console.log(`${path.relative(REPO_ROOT, CHART_PATH)} written.`);
}

if (require.main === module) main();
