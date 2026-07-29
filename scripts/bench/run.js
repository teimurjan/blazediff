#!/usr/bin/env node
/**
 * One-shot orchestrator: runs a benchmark pair, runs the compare script,
 * patches the target Markdown file, regenerates the chart. All paths resolved
 * from the repo root.
 *
 * Standalone benches (`pairs.js` → `STANDALONE`) don't have a left/right pair;
 * they own their whole pipeline and are dispatched by key with the same flags.
 *
 * Usage (from repo root):
 *   pnpm bench <bench> [--iterations N] [--warmup N]
 *                      [--skip-run] [--skip-compare] [--skip-md] [--skip-chart]
 *
 * Examples:
 *   pnpm bench core --iterations 50
 *   pnpm bench png --skip-run
 */

const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { PAIRS, STANDALONE, seriesOf } = require("./pairs.js");
const { update } = require("./update-benchmarks-md.js");
const { render: renderChart } = require("./render-chart.js");

const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const k = a.replace(/^--/, "");
			const next = argv[i + 1];
			if (next == null || next.startsWith("--")) flags[k] = true;
			else {
				flags[k] = next;
				i++;
			}
		} else positional.push(a);
	}
	return { positional, flags };
}

function run(cmd, opts = {}) {
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: "inherit", cwd: REPO_ROOT, ...opts });
}

function buildBenchCmd(side, iterations) {
	// `pnpm <script>` needs `-- --flag` to forward args to the underlying tool;
	// for `cd … && uv run python …` it can take the flag directly.
	// `--output` is a bare filename — each benchmark runs in its own package
	// dir, so the file lands at `<side.dir>/<side.filename>`.
	const it = side.iterations != null ? side.iterations : iterations;
	const args = `--format=json --output=${side.filename} --iterations=${it}`;
	const usesPnpm = side.cmd.trim().startsWith("pnpm ");
	return usesPnpm ? `${side.cmd} -- ${args}` : `${side.cmd} ${args}`;
}

function sideJsonPath(side) {
	return path.join(REPO_ROOT, side.dir, side.filename);
}

function main() {
	const { positional, flags } = parseArgs(process.argv);
	const benchKey = positional[0];

	// Standalone benches skip the pair pipeline entirely.
	if (STANDALONE[benchKey]) {
		require(STANDALONE[benchKey]).run(flags);
		return;
	}

	if (!benchKey || !PAIRS[benchKey]) {
		console.error(
			`Usage: node ${path.relative(REPO_ROOT, __filename)} <bench> [flags]`,
		);
		console.error(
			`Known benches: ${[...Object.keys(PAIRS), ...Object.keys(STANDALONE)].join(", ")}`,
		);
		process.exit(2);
	}
	const pair = PAIRS[benchKey];
	const iterations =
		flags.iterations != null ? Number(flags.iterations) : pair.iterations;
	const warmup = flags.warmup != null ? Number(flags.warmup) : pair.warmup;

	// 1. Run every series' benchmark (baseline `left`, `right`, and any extras).
	const sides = seriesOf(pair);
	if (!flags["skip-run"]) {
		for (const side of sides) run(buildBenchCmd(side, iterations));
	}

	const leftPath = sideJsonPath(pair.left);
	const rightPath = sideJsonPath(pair.right);
	const missing = sides.map(sideJsonPath).filter((p) => !fs.existsSync(p));
	if (missing.length) {
		console.error(`Missing JSON output: ${missing.join(", ")}`);
		process.exit(1);
	}

	// 2. Run the matching compare-and-print step. For multi-variant pairs we
	//    bypass the legacy wrapper and call compareAndPrint once per variant
	//    with the appropriate task-prefix filters — otherwise the wrapper's
	//    Map<key> collapses duplicate keys across variants and prints
	//    duplicate rows paired against whichever variant happened to load
	//    last. Single-variant pairs keep using their wrapper when available.
	if (!flags["skip-compare"]) {
		const hasVariants =
			Array.isArray(pair.variants) && pair.variants.length > 0;
		const rel = (side) => path.posix.join(side.dir, side.filename);
		const runCompare = (series) => {
			const inline = `const { compareAndPrint } = require('./.github/workflows/scripts/compare-and-print.js'); compareAndPrint(${JSON.stringify(
				{ series, precision: pair.precision },
			)});`;
			run(`node -e ${JSON.stringify(inline)}`);
		};
		if (hasVariants) {
			for (const variant of pair.variants) {
				console.log(`\n--- ${variant.section} ---`);
				runCompare([
					{
						file: rel(pair.left),
						name: pair.left.name,
						prefix: variant.leftTaskPrefix,
					},
					{
						file: rel(pair.right),
						name: pair.right.name,
						prefix: variant.rightTaskPrefix,
					},
				]);
			}
		} else if (pair.compareScript) {
			run(`node ${pair.compareScript}`);
		} else {
			runCompare(
				sides.map((side) => ({
					file: rel(side),
					name: side.name,
					prefix: side.taskPrefix,
				})),
			);
		}
	}

	// 3. Patch the target Markdown file.
	const targetFile = pair.targetFile || "BENCHMARKS.md";
	if (!flags["skip-md"]) {
		const result = update({
			pairKey: benchKey,
			leftPath,
			rightPath,
			iterations,
			warmup,
			precision: pair.precision,
			mdPath: path.join(REPO_ROOT, targetFile),
		});
		console.log(
			`\n${targetFile} patched (${result.variants.length} section${result.variants.length === 1 ? "" : "s"}):`,
		);
		for (const r of result.variants) {
			console.log(
				`  • "${r.section}" — ${r.rows} rows, avg ${r.avgPct.toFixed(1)}% improvement.`,
			);
			console.log(`    Iterations line: ${r.iterationsLine}`);
		}
	}

	// 4. Regenerate the target-level summary chart PNG.
	if (!flags["skip-chart"] && pair.targetFile) {
		const target = path.basename(pair.targetFile, ".md");
		try {
			const chart = renderChart({ target });
			console.log(
				`\nChart: ${path.relative(REPO_ROOT, chart.outPath)} (${chart.bars} bars).`,
			);
		} catch (err) {
			console.warn(`\nrender-chart failed: ${err.message}`);
		}
	}
}

if (require.main === module) main();
