/**
 * One entry per BENCHMARKS.md section that this skill can refresh.
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
 * prefixes used to filter the shared JSON files. The orchestrator runs the
 * benches once and patches every variant's section from the same JSON.
 *
 * **Task prefixes**: tinybench task names are of the form
 * `<prefix> - <fixture>`. When two pairs share an input JSON (e.g. `core` and
 * `core-wasm` both read `pixelmatch.json`), single-variant pairs must declare
 * the prefix they care about via `left.taskPrefix` / `right.taskPrefix`,
 * otherwise tasks from the other variant leak in as duplicate rows.
 */
const PAIRS = {
	core: {
		targetFile: "benchmarks/pixel-by-pixel.md",
		variants: [
			{
				section:
					"JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)",
				leftTaskPrefix: "pixelmatch",
				rightTaskPrefix: "blazediff",
			},
			{
				section:
					"JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)",
				leftTaskPrefix: "pixelmatch (w\\ output)",
				rightTaskPrefix: "blazediff (w\\ output)",
			},
		],
		left: {
			name: "Pixelmatch",
			cmd: "pnpm benchmark:pixelmatch",
			dir: "apps/image-benchmark",
			filename: "pixelmatch.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:core",
			dir: "apps/image-benchmark",
			filename: "blazediff.json",
		},
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
			cmd: "pnpm benchmark:pixelmatch",
			dir: "apps/image-benchmark",
			filename: "pixelmatch.json",
			// pixelmatch.json now also contains "pixelmatch (w\\ output) - X"
			// tasks — filter to the no-output ones so they don't show up as
			// duplicate rows in the wasm table.
			taskPrefix: "pixelmatch",
		},
		right: {
			name: "BlazeDiff (core-wasm)",
			cmd: "pnpm benchmark:core-wasm",
			dir: "apps/image-benchmark",
			filename: "blazediff-wasm.json",
			taskPrefix: "core-wasm",
		},
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
			cmd: "pnpm benchmark:odiff",
			dir: "apps/image-benchmark",
			filename: "odiff.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:core-native",
			dir: "apps/image-benchmark",
			filename: "blazediff.json",
		},
		compareScript: ".github/workflows/scripts/compare-and-print-core-native.js",
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
			cmd: "pnpm benchmark:ssim.js",
			dir: "apps/image-benchmark",
			filename: "ssim-js.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:ssim",
			dir: "apps/image-benchmark",
			filename: "ssim.json",
		},
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
			cmd: "pnpm benchmark:weber-ssim.js",
			dir: "apps/image-benchmark",
			filename: "weber-ssim-js.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:hitchhikers-ssim",
			dir: "apps/image-benchmark",
			filename: "hitchhikers-ssim.json",
		},
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
			cmd: "pnpm benchmark:microdiff",
			dir: "apps/object-benchmark",
			filename: "microdiff.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:object",
			dir: "apps/object-benchmark",
			filename: "blazediff.json",
		},
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
			cmd: "pnpm benchmark:python-pixelmatch",
			dir: "apps/python-benchmark",
			filename: "pixelmatch.json",
			iterations: 10,
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:python-blazediff",
			dir: "apps/python-benchmark",
			filename: "blazediff.json",
			iterations: 25,
		},
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
			cmd: "pnpm benchmark:python-opencv",
			dir: "apps/python-benchmark",
			filename: "opencv.json",
		},
		right: {
			name: "BlazeDiff",
			cmd: "pnpm benchmark:python-blazediff",
			dir: "apps/python-benchmark",
			filename: "blazediff.json",
		},
		compareScript: null,
		iterations: 25,
		warmup: 5,
		precision: 2,
		runsLabel: "iterations",
	},
};

module.exports = { PAIRS };
