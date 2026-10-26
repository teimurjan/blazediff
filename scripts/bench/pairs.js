/**
 * One entry per benchmark that `pnpm benchmark <key>` can refresh. Each run writes
 * `benchmarks/results/<key>.json` (see `artifact.js`), then patches the
 * Markdown section(s) from it.
 *
 * `package` / `pythonPackage` name the library a side measures, so the
 * artifact records its installed version. `ioIncluded` says whether the timed
 * call decodes and encodes images itself.
 *
 * Each side's `cmd` runs in `dir` (the underlying pnpm filter / cd target),
 * so `--output` is the bare filename relative to that dir. The orchestrator
 * resolves `<dir>/<filename>` for the compare-and-print step and for patching
 * BENCHMARKS.md.
 *
 * **Variants**: when a single bench command emits more than one task per
 * fixture (e.g. core + pixelmatch image benches now run a no-output case and
 * a with-output case side by side), set `variants: [...]` instead of a single
 * `section`. Each variant declares its own section heading plus the task
 * prefixes used to filter the shared JSON files, plus the `id` its artifact
 * section is stored under. The orchestrator runs the
 * benches once and patches every variant's section from the same JSON.
 *
 * **Task prefixes**: tinybench task names are of the form
 * `<prefix> - <fixture>`. When two pairs share an input JSON (e.g. `core` and
 * `core-wasm` both read `pixelmatch.json`), single-variant pairs must declare
 * the prefix they care about via `left.taskPrefix` / `right.taskPrefix`,
 * otherwise tasks from the other variant leak in as duplicate rows.
 */
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");

const PAIRS = {
	core: {
		targetFile: "benchmarks/pixel-by-pixel.md",
		variants: [
			{
				id: "core",
				section:
					"JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)",
				leftTaskPrefix: "pixelmatch",
				rightTaskPrefix: "blazediff",
			},
			{
				id: "core-output",
				section:
					"JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)",
				leftTaskPrefix: "pixelmatch (w\\ output)",
				rightTaskPrefix: "blazediff (w\\ output)",
			},
		],
		left: {
			name: "Pixelmatch",
			cmd: "pnpm --filter @blazediff/image-benchmark pixelmatch",
			package: "pixelmatch",
			dir: "apps/image-benchmark",
			filename: "pixelmatch.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/image-benchmark core",
			package: "@blazediff/core",
			dir: "apps/image-benchmark",
			filename: "blazediff.json",
		},
		ioIncluded: false,
		compareScript: ".github/workflows/scripts/compare-and-print-core.js",
		iterations: 50,
		warmup: 5,
		precision: 2,
		runsLabel: "iterations",
	},
	"core-wasm": {
		targetFile: "benchmarks/pixel-by-pixel.md",
		section:
			"WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)",
		left: {
			name: "Pixelmatch",
			cmd: "pnpm --filter @blazediff/image-benchmark pixelmatch",
			package: "pixelmatch",
			dir: "apps/image-benchmark",
			filename: "pixelmatch.json",
			// pixelmatch.json now also contains "pixelmatch (w\\ output) - X"
			// tasks — filter to the no-output ones so they don't show up as
			// duplicate rows in the wasm table.
			taskPrefix: "pixelmatch",
		},
		right: {
			name: "BlazeDiff (core-wasm)",
			cmd: "pnpm --filter @blazediff/image-benchmark core-wasm",
			package: "@blazediff/core-wasm",
			dir: "apps/image-benchmark",
			filename: "blazediff-wasm.json",
			taskPrefix: "core-wasm",
		},
		ioIncluded: false,
		compareScript: null,
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "iterations",
	},
	"core-native": {
		targetFile: "benchmarks/pixel-by-pixel.md",
		section:
			"JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) (image IO included)",
		left: {
			name: "ODiff",
			cmd: "pnpm --filter @blazediff/image-benchmark odiff",
			package: "odiff-bin",
			dir: "apps/image-benchmark",
			filename: "odiff.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/image-benchmark core-native",
			package: "@blazediff/core-native",
			dir: "apps/image-benchmark",
			filename: "blazediff.json",
		},
		// Additional implementations compared against the baseline (`left`).
		// Each extra side becomes its own column (ms + saved + %) in the table
		// and its own bar in the chart. blazediff-next reuses the `blazediff`
		// task prefix but lives in its own JSON file, so there's no collision.
		extra: [
			{
				name: "BlazeDiff Next",
				cmd: "BLAZEDIFF_PNG_ENABLED=1 pnpm --filter @blazediff/image-benchmark core-native",
				package: "@blazediff/core-native",
				dir: "apps/image-benchmark",
				filename: "blazediff-next.json",
			},
		],
		ioIncluded: true,
		compareScript: ".github/workflows/scripts/compare-and-print-core-native.js",
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "runs",
	},
	honeydiff: {
		targetFile: "benchmarks/pixel-by-pixel.md",
		section:
			"JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) (image IO included)",
		note: "Both libraries run at their defaults with antialiasing on and write a diff PNG. honeydiff thresholds on CIEDE2000 ΔE and BlazeDiff on YIQ, so this compares speed, not identical output.",
		left: {
			name: "honeydiff",
			cmd: "pnpm --filter @blazediff/image-benchmark honeydiff",
			package: "@vizzly-testing/honeydiff",
			dir: "apps/image-benchmark",
			filename: "honeydiff.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/image-benchmark core-native",
			package: "@blazediff/core-native",
			dir: "apps/image-benchmark",
			filename: "blazediff.json",
		},
		ioIncluded: true,
		compareScript: null,
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "runs",
	},
	ssim: {
		targetFile: "benchmarks/structural.md",
		section:
			"Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm) (image IO excluded)",
		left: {
			name: "ssim.js",
			cmd: "pnpm --filter @blazediff/image-benchmark ssim.js",
			package: "ssim.js",
			dir: "apps/image-benchmark",
			filename: "ssim-js.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/image-benchmark ssim",
			package: "@blazediff/ssim",
			dir: "apps/image-benchmark",
			filename: "ssim.json",
			// ssim.json now also holds "ssim-native - X" tasks; without this the
			// JS and native rows collide on the same fixture key.
			taskPrefix: "ssim",
		},
		// The Rust port, benchmarked in the same run over the same decoded
		// buffers — one bench command, two series out of one JSON.
		extra: [
			{
				name: "BlazeDiff (ssim-native)",
				cmd: "pnpm --filter @blazediff/image-benchmark ssim",
				package: "@blazediff/ssim-native",
				dir: "apps/image-benchmark",
				filename: "ssim.json",
				taskPrefix: "ssim-native",
			},
		],
		ioIncluded: false,
		compareScript: ".github/workflows/scripts/compare-and-print-ssim.js",
		iterations: 25,
		warmup: 3,
		precision: 2,
		runsLabel: "iterations",
	},
	"hitchhikers-ssim": {
		targetFile: "benchmarks/structural.md",
		section:
			"Hitchhikers SSIM SSIM (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm) (image IO excluded)",
		left: {
			name: "ssim.js",
			cmd: "pnpm --filter @blazediff/image-benchmark weber-ssim.js",
			package: "ssim.js",
			dir: "apps/image-benchmark",
			filename: "weber-ssim-js.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/image-benchmark hitchhikers-ssim",
			package: "@blazediff/ssim",
			dir: "apps/image-benchmark",
			filename: "hitchhikers-ssim.json",
			// hitchhikers-ssim.json also holds "hitchhikers-ssim-native - X"
			// tasks; without this the JS and native rows collide on the same
			// fixture key.
			taskPrefix: "hitchhikers-ssim",
		},
		// The Rust port, benchmarked in the same run over the same decoded
		// buffers — one bench command, two series out of one JSON.
		extra: [
			{
				name: "BlazeDiff (ssim-native)",
				cmd: "pnpm --filter @blazediff/image-benchmark hitchhikers-ssim",
				package: "@blazediff/ssim-native",
				dir: "apps/image-benchmark",
				filename: "hitchhikers-ssim.json",
				taskPrefix: "hitchhikers-ssim-native",
			},
		],
		ioIncluded: false,
		compareScript: null,
		iterations: 25,
		warmup: 3,
		precision: 2,
		runsLabel: "iterations",
	},
	object: {
		targetFile: "benchmarks/object.md",
		section: "Object (`@blazediff/object` vs `microdiff`)",
		left: {
			name: "Microdiff",
			cmd: "pnpm --filter @blazediff/object-benchmark microdiff",
			package: "microdiff",
			dir: "apps/object-benchmark",
			filename: "microdiff.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm --filter @blazediff/object-benchmark object",
			package: "@blazediff/object",
			dir: "apps/object-benchmark",
			filename: "blazediff.json",
		},
		ioIncluded: false,
		compareScript: ".github/workflows/scripts/compare-and-print-object.js",
		iterations: 10000,
		warmup: 50,
		precision: 4,
		runsLabel: "iterations",
	},
	"python-pixelmatch": {
		targetFile: "benchmarks/pixel-by-pixel.md",
		section: "vs `pixelmatch` (pypi)",
		left: {
			name: "pixelmatch (pypi)",
			cmd: "cd apps/python-benchmark && uv run python -m benchmarks.pixelmatch_bench",
			pythonPackage: "pixelmatch",
			dir: "apps/python-benchmark",
			filename: "pixelmatch.json",
			iterations: 10,
		},
		right: {
			name: "BlazeDiff",
			cmd: "cd apps/python-benchmark && uv run python -m benchmarks.blazediff_bench",
			pythonPackage: "blazediff",
			dir: "apps/python-benchmark",
			filename: "blazediff.json",
			iterations: 25,
		},
		ioIncluded: true,
		compareScript: null,
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "iterations",
	},
	"python-opencv": {
		targetFile: "benchmarks/pixel-by-pixel.md",
		section: "vs `opencv-python` (`cv2.absdiff`)",
		left: {
			name: "OpenCV absdiff",
			cmd: "cd apps/python-benchmark && uv run python -m benchmarks.opencv_bench",
			pythonPackage: "opencv-python",
			dir: "apps/python-benchmark",
			filename: "opencv.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "cd apps/python-benchmark && uv run python -m benchmarks.blazediff_bench",
			pythonPackage: "blazediff",
			dir: "apps/python-benchmark",
			filename: "blazediff.json",
		},
		ioIncluded: true,
		compareScript: null,
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "iterations",
	},
};

/**
 * Benches that don't fit the left/right pair model — a single command owns the
 * whole run and writes its own Markdown + chart. `run.js` dispatches these by
 * key to `require(<module>).run(flags)`, so `pnpm benchmark <key>` stays the one
 * entry point for every benchmark.
 */
const STANDALONE = {
	png: "./png.js",
	"png-wasm": "./png-wasm.js",
	"ssim-dssim": "./ssim-dssim.js",
};

/**
 * Ordered series for a pair: `[left, right, ...extra]`. The first entry is the
 * baseline that "Time Saved" / "% Improvement" columns are measured against.
 * Multi-variant pairs don't carry `extra` — they stay strictly two-sided.
 */
function seriesOf(pair) {
	return [pair.left, pair.right, ...(pair.extra || [])];
}

// Each side runs in its own package dir, so its JSON lands at `<dir>/<filename>`.
function sideJsonPath(side) {
	return path.join(REPO_ROOT, side.dir, side.filename);
}

module.exports = { PAIRS, STANDALONE, seriesOf, sideJsonPath };
