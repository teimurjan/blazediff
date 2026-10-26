/**
 * The `png-wasm` standalone bench: PNG codecs compiled to WebAssembly, timed
 * in Node. `@blazediff/codec-png-wasm` against zune-png (built from
 * `apps/image-benchmark/zune-png-wasm`) and `@jsquash/png`.
 * Dispatched by `run.js` (see `STANDALONE` in `pairs.js`), not a CLI itself.
 *
 * Pipeline:
 *   1. Build the zune-png wasm shim, the codec-png-wasm module when it is
 *      missing, and the image-benchmark app.
 *   2. Run `pnpm --filter @blazediff/image-benchmark png-wasm`, which writes JSON.
 *   3. Convert it into `benchmarks/results/png-wasm.json` and regenerate
 *      `benchmarks/png-codec.md` (see `png.js`).
 *
 * Usage (from repo root):
 *   pnpm benchmark png-wasm               # build + run, then regenerate
 *   pnpm benchmark png-wasm --skip-run    # reuse the last JSON
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
	header,
	writeArtifact,
	readArtifact,
	artifactPath,
} = require("./artifact.js");
const { npmVersion } = require("./env.js");
const { writeMarkdown } = require("./png.js");

const KEY = "png-wasm";
const REPO_ROOT = path.resolve(__dirname, "../..");
const BENCH_DIR = path.join(REPO_ROOT, "apps/image-benchmark");
const ZUNE_DIR = path.join(BENCH_DIR, "zune-png-wasm");
const ZUNE_WASM = path.join(
	ZUNE_DIR,
	"target/wasm32-unknown-unknown/release/zune_png_wasm_bench.wasm",
);
const CODEC_WASM = path.join(
	REPO_ROOT,
	"packages/codec-png-wasm/wasm/blazediff_png_bg.wasm",
);

const SERIES = {
	blazediff: { name: "blazediff", package: "@blazediff/codec-png-wasm" },
	zune: { name: "zune-png", version: zuneVersion() },
	jsquash: { name: "jSquash", package: "@jsquash/png" },
};

function zuneVersion() {
	const manifest = fs.readFileSync(path.join(ZUNE_DIR, "Cargo.toml"), "utf8");
	return manifest.match(/zune-png = "=?([^"]+)"/)?.[1];
}

function sh(cmd, cwd = REPO_ROOT, env = process.env) {
	console.log(`\n$ ${cmd}`);
	execSync(cmd, { stdio: "inherit", cwd, env });
}

function runBenchmark(jsonPath, fixtures) {
	// Same SIMD flags the codec-png-wasm build uses, so zune gets wasm SIMD too.
	sh("cargo build --release --target wasm32-unknown-unknown", ZUNE_DIR, {
		...process.env,
		RUSTFLAGS: "-C target-feature=+simd128,+bulk-memory",
	});
	// An LFS pointer stub is a few hundred bytes; a real module is ~150 KB.
	const codecBuilt =
		fs.existsSync(CODEC_WASM) && fs.statSync(CODEC_WASM).size > 1024;
	if (!codecBuilt) sh("pnpm build:wasm:codec-png");
	sh("pnpm --filter @blazediff/codec-png-wasm build");
	sh("pnpm --filter @blazediff/image-benchmark build");
	const subset = fixtures
		? ` --fixtures ${JSON.stringify(path.resolve(REPO_ROOT, fixtures))}`
		: "";
	sh(
		`pnpm --filter @blazediff/image-benchmark png-wasm --zune ${JSON.stringify(ZUNE_WASM)} --output ${JSON.stringify(jsonPath)}${subset}`,
	);
}

function toArtifact(data) {
	const ids = data.names;
	const meta = (id) => ({
		id,
		name: SERIES[id].name,
		version: SERIES[id].package
			? npmVersion(SERIES[id].package, BENCH_DIR)
			: SERIES[id].version,
		baseline: false,
		ours: id === "blazediff",
	});
	const levels = (list) =>
		`Levels: ${ids
			.flatMap((id, i) => (list[i] ? [`${SERIES[id].name} ${list[i]}`] : []))
			.join(" · ")}.`;
	// Only codecs with a value in the first row take part in a section: jSquash
	// has no uncompressed mode.
	const section = (id, title, unit, pick, baseline, note) => {
		const included = ids.flatMap((_id, i) =>
			pick(data.rows[0])[i] === null ? [] : [i],
		);
		const series = included.map((i) => ({
			...meta(ids[i]),
			baseline: ids[i] === baseline,
		}));
		return {
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
					included.map((i) => [ids[i], { value: pick(r)[i] }]),
				),
			})),
		};
	};
	const none = levels(data.encodeLevels.none);
	const defaults = levels(data.encodeLevels.default);
	return {
		...header({
			key: KEY,
			category: "png-codec",
			config: {
				method:
					"best-of, iterations scaled by image size, single-threaded, Node (V8) running wasm32 with SIMD",
				ioIncluded: false,
			},
		}),
		sections: [
			section(
				"decode",
				"WebAssembly decode (PNG to RGBA8)",
				"ms",
				(r) => r.dec,
				"jsquash",
			),
			section(
				"encode-none",
				"WebAssembly encode, no compression",
				"ms",
				(r) => r.encNone,
				"zune",
				none,
			),
			section(
				"encode-default",
				"WebAssembly encode, default settings",
				"ms",
				(r) => r.encDefault,
				"jsquash",
				defaults,
			),
			section(
				"size-none",
				"WebAssembly encode size, no compression",
				"bytes",
				(r) => r.sizeNone,
				"zune",
				none,
			),
			section(
				"size-default",
				"WebAssembly encode size, default settings",
				"bytes",
				(r) => r.sizeDefault,
				"jsquash",
				defaults,
			),
		],
	};
}

function run(flags = {}) {
	const jsonPath = flags.json
		? path.resolve(REPO_ROOT, flags.json)
		: path.join(os.tmpdir(), "blazediff-png-wasm-bench.json");

	if (!flags["skip-run"]) runBenchmark(jsonPath, flags.fixtures);

	if (flags["skip-artifact"]) {
		if (!readArtifact(KEY)) {
			console.error(`Missing artifact: ${artifactPath(KEY)}`);
			process.exit(1);
		}
	} else {
		if (!fs.existsSync(jsonPath)) {
			console.error(`Missing benchmark JSON: ${jsonPath}`);
			process.exit(1);
		}
		const artifact = toArtifact(JSON.parse(fs.readFileSync(jsonPath, "utf8")));
		console.log(
			`\nArtifact: ${path.relative(REPO_ROOT, writeArtifact(artifact))}`,
		);
	}

	if (!flags["skip-md"]) writeMarkdown();
}

module.exports = { run };
