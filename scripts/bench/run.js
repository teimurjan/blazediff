#!/usr/bin/env node
/**
 * One-shot orchestrator: runs a benchmark pair, runs the compare script,
 * writes the artifact (`benchmarks/results/<platform>/<key>.json`), and
 * patches the target Markdown file from it when this machine owns it. All paths resolved from the repo root.
 *
 * Standalone benches (`pairs.js` → `STANDALONE`) don't have a left/right pair;
 * they own their whole pipeline and are dispatched by key with the same flags.
 *
 * Usage (from repo root):
 *   pnpm benchmark <bench> [--iterations N] [--warmup N] [--fixtures a,b]
 *                      [--skip-run] [--skip-compare] [--skip-artifact] [--skip-md]
 *
 * Examples:
 *   pnpm benchmark core --iterations 50
 *   pnpm benchmark core --iterations 2 --fixtures pixelmatch
 *   pnpm benchmark png --skip-run
 */

const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { PAIRS, STANDALONE, seriesOf, sideJsonPath } = require("./pairs.js");
const { update } = require("./update-benchmarks-md.js");
const {
	buildPairArtifact,
	writeArtifact,
	readArtifact,
	ownsMarkdown,
	artifactPath,
	REFERENCE_PLATFORM,
} = require("./artifact.js");

const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--") && a.includes("=")) {
			const [k, ...v] = a.slice(2).split("=");
			flags[k] = v.join("=");
		} else if (a.startsWith("--")) {
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

function buildBenchCmd(side, iterations, fixtures) {
	// `pnpm <script>` needs `-- --flag` to forward args to the underlying tool;
	// for `cd … && uv run python …` it can take the flag directly.
	// `--output` is a bare filename — each benchmark runs in its own package
	// dir, so the file lands at `<side.dir>/<side.filename>`.
	const it = side.iterations != null ? side.iterations : iterations;
	const subset = fixtures ? ` --fixtures=${fixtures}` : "";
	const args = `--format=json --output=${side.filename} --iterations=${it}${subset}`;
	// Matches an env-prefixed call too (`BLAZEDIFF_PNG_ENABLED=1 pnpm …`).
	const usesPnpm = /(^|\s)pnpm\s/.test(side.cmd);
	return usesPnpm ? `${side.cmd} -- ${args}` : `${side.cmd} ${args}`;
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
	//    Two series can share one command when a single bench emits both (the
	//    ssim pair benchmarks the JS and Rust ports in one pass, split by task
	//    prefix), so run each distinct command+output once.
	const sides = seriesOf(pair);
	if (!flags["skip-run"]) {
		const ran = new Set();
		for (const side of sides) {
			const key = `${side.cmd}\0${sideJsonPath(side)}`;
			if (ran.has(key)) continue;
			ran.add(key);
			run(buildBenchCmd(side, iterations, flags.fixtures));
		}
	}

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

	// 3. Write the artifact every consumer (md, website, CI) reads from.
	let artifact;
	if (flags["skip-artifact"]) {
		artifact = readArtifact(benchKey);
		if (!artifact) {
			console.error(`Missing artifact: ${artifactPath(benchKey)}`);
			process.exit(1);
		}
	} else {
		artifact = buildPairArtifact(benchKey, pair, { iterations, warmup });
		const out = writeArtifact(artifact);
		console.log(`\nArtifact: ${path.relative(REPO_ROOT, out)}`);
	}

	// 4. Patch the target Markdown file from the artifact.
	if (!flags["skip-md"] && !ownsMarkdown(benchKey)) {
		console.log(
			`\n${pair.targetFile} left as is: it shows the ${REFERENCE_PLATFORM} run.`,
		);
	} else if (!flags["skip-md"]) {
		const reports = update({
			pair,
			artifact,
			mdPath: path.join(REPO_ROOT, pair.targetFile),
		});
		console.log(
			`\n${pair.targetFile} patched (${reports.length} section${reports.length === 1 ? "" : "s"}):`,
		);
		for (const r of reports) {
			console.log(
				`  • "${r.section}" — ${r.rows} rows, avg ${r.avgPct.toFixed(1)}% improvement.`,
			);
			console.log(`    Iterations line: ${r.iterationsLine}`);
		}
	}
}

if (require.main === module) main();
