/**
 * The `png` standalone bench: orchestrate the blazediff-png codec benchmark and
 * render it into the same Markdown style as the JS benchmark suite.
 * Dispatched by `run.js` (see `STANDALONE` in `pairs.js`), not a CLI itself.
 *
 * Pipeline:
 *   1. Run the Rust benchmark (`blazediff-png-benchmark`) with `--json`, which
 *      times decode + encode + encoded size for every fixture across
 *      blazediff / spng / image-rs / zune.
 *   2. Convert that JSON into `benchmarks/results/png.json` (see `artifact.js`).
 *   3. Write `benchmarks/png-codec.md` (intro, decode/encode/size tables) from
 *      the artifact in the existing HTML-table style.
 *
 * Usage (from repo root):
 *   pnpm benchmark png                 # build + run, then regenerate
 *   pnpm benchmark png --skip-run      # reuse the last JSON
 *   pnpm benchmark png --json <path>   # read/write a specific JSON
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
	header,
	slug,
	writeArtifact,
	readArtifact,
	artifactPath,
} = require("./artifact.js");

const KEY = "png";
const REPO_ROOT = path.resolve(__dirname, "../..");
const CRATES_DIR = path.join(REPO_ROOT, "crates");
const MD_PATH = path.join(REPO_ROOT, "benchmarks/png-codec.md");
const BASELINE = "spng";
const OURS = "blazediff";

function runBenchmark(jsonPath) {
	const cmd = `cargo run --release -p blazediff-png-benchmark -- --json ${JSON.stringify(jsonPath)}`;
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: "inherit", cwd: CRATES_DIR });
}

// --- artifact ---------------------------------------------------------------

// "blazediff libdeflate 6 · spng zlib 4 · image-rs flate2 4 · zune stored"
function levelNote(names, levels) {
	return `Levels: ${names.map((n, i) => `${n} ${levels[i]}`).join(" · ")}.`;
}

function toArtifact(data) {
	const series = data.names.map((name) => ({
		id: slug(name),
		name,
		baseline: name === BASELINE,
		ours: name === OURS,
	}));
	const section = (id, title, unit, pick, note) => ({
		id,
		title,
		unit,
		stat: unit === "ms" ? "best" : "size",
		note,
		series,
		rows: data.rows.map((r) => ({
			fixture: r.name,
			mpx: r.mpx,
			values: Object.fromEntries(
				pick(r).map((value, i) => [series[i].id, { value }]),
			),
		})),
	});
	const none = levelNote(data.names, data.encodeLevels.none);
	const half = levelNote(data.names, data.encodeLevels.half);
	return {
		...header({
			key: KEY,
			category: "png-codec",
			config: {
				method: "best-of, iterations scaled by image size, single-threaded",
				ioIncluded: false,
			},
		}),
		sections: [
			section("decode", "Decode (PNG to RGBA8)", "ms", (r) => r.dec),
			section(
				"encode-none",
				"Encode, no compression",
				"ms",
				(r) => r.encNone,
				none,
			),
			section(
				"encode-half",
				"Encode, half compression",
				"ms",
				(r) => r.encHalf,
				half,
			),
			section(
				"size-none",
				"Encode size, no compression",
				"bytes",
				(r) => r.sizeNone,
				none,
			),
			section(
				"size-half",
				"Encode size, half compression",
				"bytes",
				(r) => r.sizeHalf,
				half,
			),
		],
	};
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

const rowValues = (section, row) =>
	section.series.map((s) => row.values[s.id].value);

function seriesTotals(section) {
	const totals = section.series.map(() => 0);
	for (const row of section.rows) {
		rowValues(section, row).forEach((v, i) => {
			totals[i] += v;
		});
	}
	return totals;
}

// A decode/encode timing table: one row per fixture plus a bold TOTAL, with a
// trailing "blazediff vs spng" % column tying back to the headline ratio.
function timingTable(section) {
	const ids = section.series.map((s) => s.id);
	const bdIdx = ids.indexOf(OURS);
	const spngIdx = ids.indexOf(BASELINE);
	const saved = (vals) =>
		vals[spngIdx] ? ((vals[spngIdx] - vals[bdIdx]) / vals[spngIdx]) * 100 : 0;
	const head = [
		"Benchmark",
		"MPx",
		...section.series.map((s) => s.name),
		"BlazeDiff vs spng",
	];
	const body = section.rows.map((row) => {
		const vals = rowValues(section, row);
		return [
			row.fixture,
			row.mpx.toFixed(1),
			...vals.map(fmtMs),
			fmtPct(saved(vals)),
		];
	});
	const totals = seriesTotals(section);
	body.push([
		"<strong>TOTAL</strong>",
		"",
		...totals.map((t) => `<strong>${fmtMs(t)}</strong>`),
		`<strong>${fmtPct(saved(totals))}</strong>`,
	]);
	return {
		html: htmlTable(head, body),
		ratio: totals[spngIdx] / totals[bdIdx],
	};
}

function sizeTable(section) {
	const baseIdx = section.series.findIndex((s) => s.baseline);
	const head = ["Benchmark", ...section.series.map((s) => s.name)];
	const body = section.rows.map((row) => [
		row.fixture,
		...rowValues(section, row).map(fmtKb),
	]);
	const totals = seriesTotals(section);
	body.push([
		"<strong>TOTAL</strong>",
		...totals.map((t) => `<strong>${fmtKb(t)}</strong>`),
	]);
	body.push([
		`<strong>vs ${BASELINE}</strong>`,
		...totals.map(
			(t) => `<strong>${fmtPct((t / totals[baseIdx]) * 100)}</strong>`,
		),
	]);
	return htmlTable(head, body);
}

// A full encode section (heading, level note, ratio blockquote, timing table,
// size table) for one compression mode.
function encodeSection(timing, size, label, encNick) {
	const t = timingTable(timing);
	return [
		`## Encode — ${label}`,
		"",
		`_${timing.note}_`,
		"",
		`> blazediff encodes **~${t.ratio.toFixed(2)}×** faster than spng (${encNick}) across the corpus.`,
		"",
		t.html,
		"",
		`### Encode Size — ${label}`,
		"",
		"> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output — far larger than the rest.",
		"",
		sizeTable(size),
		"",
	].join("\n");
}

function buildMarkdown(artifact) {
	const byId = Object.fromEntries(artifact.sections.map((s) => [s.id, s]));
	const decode = timingTable(byId.decode);
	const rows = byId.decode.rows;
	const totalMpx = rows.reduce((s, r) => s + r.mpx, 0);

	return `${[
		"# PNG Codec Benchmarks",
		"",
		`A from-scratch PNG codec in Rust — \`blazediff-png\` — against [spng](https://libspng.org), image-rs (\`png\`), and [zune-png](https://github.com/etemesi254/zune-image). Decode and encode are timed (best-of, size-scaled iteration counts) over the full fixture corpus (${rows.length} PNGs, ${totalMpx.toFixed(1)} MPx), single-threaded on ${artifact.env.cpu ?? "the reference machine"}. Lower is better.`,
		"",
		"Encode is measured at two settings so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly: **no compression** (stored deflate blocks) and **half compression** (half of each codec's own max deflate level — libdeflate 12 → 6, zlib 9 → 4).",
		"",
		"**Speed here, correctness elsewhere.** These are timing numbers. Byte-identical *decode* parity with spng is verified separately on a large public-image corpus — Urban100, BSD100, Set14, Set5 (real high-res photos) plus the full [PngSuite](http://www.schaik.com/pngsuite/) (every format corner and the intentionally-malformed files), ~395 files — by the `corpus_differential` test: every file decodes byte-identically to spng at RGBA8 and at every `SPNG_FMT_*`, malformed files reject in lockstep, and every accepted image survives a blazediff encode → decode round-trip. Fetch the corpus with `crates/blazediff-png/scripts/fetch-corpus.sh` and run with `BLAZEDIFF_PNG_CORPUS` set; the `Benchmark PNG` GitHub workflow runs the benchmark and this verification.",
		"",
		"## Decode",
		"",
		`> blazediff decodes **~${decode.ratio.toFixed(2)}×** faster than spng across the corpus.`,
		"",
		decode.html,
		"",
		encodeSection(
			byId["encode-none"],
			byId["size-none"],
			"No Compression",
			"stored",
		),
		encodeSection(
			byId["encode-half"],
			byId["size-half"],
			"Half Compression",
			"zlib 4",
		),
	].join("\n")}`;
}

// Flags come from `run.js`'s parser, so `--skip-run` / `--skip-artifact` /
// `--skip-md` mean the same here as they do for pair benches.
function run(flags = {}) {
	const jsonPath = flags.json
		? path.resolve(REPO_ROOT, flags.json)
		: path.join(os.tmpdir(), "blazediff-png-bench.json");

	if (!flags["skip-run"]) runBenchmark(jsonPath);

	let artifact;
	if (flags["skip-artifact"]) {
		artifact = readArtifact(KEY);
		if (!artifact) {
			console.error(`Missing artifact: ${artifactPath(KEY)}`);
			process.exit(1);
		}
	} else {
		if (!fs.existsSync(jsonPath)) {
			console.error(`Missing benchmark JSON: ${jsonPath}`);
			process.exit(1);
		}
		artifact = toArtifact(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
		const out = writeArtifact(artifact);
		console.log(`\nArtifact: ${path.relative(REPO_ROOT, out)}`);
	}

	if (!flags["skip-md"]) {
		fs.writeFileSync(MD_PATH, buildMarkdown(artifact));
		console.log(
			`\n${path.relative(REPO_ROOT, MD_PATH)} written (${artifact.sections[0].rows.length} fixtures).`,
		);
	}
}

module.exports = { run };
