/**
 * The `ssim-dssim` standalone bench: time blazediff's Rust SSIM family against
 * dssim (`blazediff-ssim-benchmark`, AGPL, so opt-in via `--features dssim`)
 * and store the time table as `benchmarks/results/ssim-dssim.json`.
 * Dispatched by `run.js` (see `STANDALONE` in `pairs.js`), not a CLI itself.
 *
 * No Markdown: the crate README keeps its hand-written analysis.
 *
 * Usage (from repo root):
 *   pnpm benchmark ssim-dssim                  # build + run, then write the artifact
 *   pnpm benchmark ssim-dssim --skip-run       # reuse the last JSON
 *   pnpm benchmark ssim-dssim --max-mpx 4      # cap the corpus while iterating
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { header, slug, writeArtifact } = require("./artifact.js");

const KEY = "ssim-dssim";
const REPO_ROOT = path.resolve(__dirname, "../..");
const CRATES_DIR = path.join(REPO_ROOT, "crates");
const BASELINE = "dssim";

function runBenchmark(jsonPath, maxMpx) {
	const cap = maxMpx ? ` --max-mpx ${Number(maxMpx)}` : "";
	const cmd = `cargo run --release -p blazediff-ssim-benchmark --features dssim --bin blazediff-ssim-benchmark -- --json ${JSON.stringify(jsonPath)}${cap}`;
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: "inherit", cwd: CRATES_DIR });
}

// Baseline first, matching the pair benches' column order.
function toArtifact(data) {
	const order = [
		data.contenders.indexOf(BASELINE),
		...data.contenders.flatMap((name, i) => (name === BASELINE ? [] : [i])),
	];
	const series = order.map((i) => ({
		id: slug(data.contenders[i]),
		name: data.contenders[i],
		baseline: data.contenders[i] === BASELINE,
		ours: data.contenders[i] !== BASELINE,
	}));
	return {
		...header({
			key: KEY,
			category: "structural",
			config: {
				method: `best-of, iterations scaled by image size, dssim ${data.dssimThreaded ? "multi-threaded" : "single-threaded"}`,
				ioIncluded: false,
			},
		}),
		sections: [
			{
				id: KEY,
				title: "Rust (`blazediff-ssim` vs `dssim`) (image IO excluded)",
				unit: "ms",
				stat: "best",
				note: "dssim is a different algorithm (multi-scale, Lab chroma), so this compares cost, not scores.",
				series,
				rows: data.rows.map((r) => ({
					fixture: r.name,
					mpx: r.mpx,
					values: Object.fromEntries(
						order.map((i, j) => [
							series[j].id,
							r.times[i] == null ? null : { value: r.times[i] },
						]),
					),
				})),
			},
		],
	};
}

function run(flags = {}) {
	const jsonPath = flags.json
		? path.resolve(REPO_ROOT, flags.json)
		: path.join(os.tmpdir(), "blazediff-ssim-dssim-bench.json");

	if (!flags["skip-run"]) runBenchmark(jsonPath, flags["max-mpx"]);
	if (!fs.existsSync(jsonPath)) {
		console.error(`Missing benchmark JSON: ${jsonPath}`);
		process.exit(1);
	}
	if (flags["skip-artifact"]) return;

	const out = writeArtifact(
		toArtifact(JSON.parse(fs.readFileSync(jsonPath, "utf8"))),
	);
	console.log(`\nArtifact: ${path.relative(REPO_ROOT, out)}`);
}

module.exports = { run };
