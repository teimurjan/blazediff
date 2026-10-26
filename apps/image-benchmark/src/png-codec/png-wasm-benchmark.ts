#!/usr/bin/env node

/**
 * PNG codecs compiled to WebAssembly, run in Node (V8): @blazediff/codec-png-wasm
 * against zune-png (built from `zune-png-wasm/`, since zune ships no wasm
 * package) and @jsquash/png (the Rust `png` crate via Squoosh).
 *
 * Same method as the native `png` bench: best-of, iterations scaled by image
 * size, single-threaded, over every PNG under `fixtures/`. Each timed call
 * copies the input into wasm memory and the output back out, which is what a
 * caller pays.
 *
 * Usage: node dist/png-codec/png-wasm-benchmark.js --zune <zune.wasm> --output <json>
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";

interface RgbaImage {
	data: Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

interface Codec {
	name: string;
	decode(png: Uint8Array): Promise<unknown>;
	/** Stored (uncompressed) encode, or null when the codec has none. */
	encodeNone: ((image: RgbaImage) => Promise<Uint8Array>) | null;
	/** The codec's default encode. */
	encodeDefault(image: RgbaImage): Promise<Uint8Array>;
	levelNone: string | null;
	levelDefault: string;
}

// Both packages are ESM whose glue resolves its .wasm from `import.meta.url`;
// a dynamic import keeps tsup from bundling them into this CJS file.
const esm = <T>(specifier: string) =>
	Function("s", "return import(s)")(specifier) as Promise<T>;

const require = createRequire(__filename);

async function blazediffCodec(): Promise<Codec> {
	const png = await esm<typeof import("@blazediff/codec-png-wasm")>(
		"@blazediff/codec-png-wasm",
	);
	await png.initCodecPngWasm(
		readFileSync(
			require.resolve("@blazediff/codec-png-wasm/wasm/blazediff_png_bg.wasm"),
		),
	);
	return {
		name: "blazediff",
		decode: (bytes) => png.decode(bytes),
		// RGBA8 out, like zune and like the native bench: no color-mode scan.
		encodeNone: (image) =>
			png.encode(image, { compression: 0, filter: "none", color: "rgba8" }),
		encodeDefault: (image) => png.encode(image),
		levelNone: "stored",
		levelDefault: "fdeflate, adaptive filter",
	};
}

interface ZuneExports {
	memory: WebAssembly.Memory;
	alloc(len: number): number;
	dealloc(ptr: number, len: number): void;
	out_ptr(): number;
	decode(ptr: number, len: number): number;
	encode(ptr: number, width: number, height: number): number;
}

async function zuneCodec(wasmPath: string): Promise<Codec> {
	const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath));
	const zune = instance.exports as unknown as ZuneExports;

	// Copy `input` in, run `call`, copy the result out of zune's output buffer.
	const roundTrip = (input: Uint8Array, call: (ptr: number) => number) => {
		const ptr = zune.alloc(input.length);
		new Uint8Array(zune.memory.buffer, ptr, input.length).set(input);
		const len = call(ptr);
		zune.dealloc(ptr, input.length);
		if (len === 0) throw new Error("zune-png failed");
		return new Uint8Array(zune.memory.buffer, zune.out_ptr(), len).slice();
	};
	const stored = async (image: RgbaImage) =>
		roundTrip(new Uint8Array(image.data.buffer), (ptr) =>
			zune.encode(ptr, image.width, image.height),
		);

	return {
		name: "zune",
		decode: async (bytes) =>
			roundTrip(bytes, (ptr) => zune.decode(ptr, bytes.length)),
		encodeNone: stored,
		encodeDefault: stored,
		levelNone: "stored",
		// zune-png has no compressed mode.
		levelDefault: "stored",
	};
}

async function jsquashCodec(): Promise<Codec> {
	const decodeModule = await esm<typeof import("@jsquash/png/decode.js")>(
		"@jsquash/png/decode.js",
	);
	const encodeModule = await esm<typeof import("@jsquash/png/encode.js")>(
		"@jsquash/png/encode.js",
	);
	const wasm = readFileSync(
		join(
			dirname(require.resolve("@jsquash/png")),
			"codec/pkg/squoosh_png_bg.wasm",
		),
	);
	await Promise.all([decodeModule.init(wasm), encodeModule.init(wasm)]);
	return {
		name: "jsquash",
		decode: (bytes) =>
			decodeModule.default(
				bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				) as ArrayBuffer,
			),
		encodeNone: null,
		encodeDefault: async (image) =>
			new Uint8Array(
				await encodeModule.default({
					data: new Uint8ClampedArray(image.data.buffer),
					width: image.width,
					height: image.height,
					colorSpace: "srgb",
				} as ImageData),
			),
		levelNone: null,
		levelDefault: "png crate default",
	};
}

/** Best-of wall time (ms), the same stopping rule as the native bench. */
async function timed(
	maxIters: number,
	budgetMs: number,
	run: () => Promise<unknown>,
): Promise<number> {
	let best = Number.POSITIVE_INFINITY;
	const start = performance.now();
	for (let i = 1; ; i++) {
		const t = performance.now();
		await run();
		best = Math.min(best, performance.now() - t);
		if (i >= maxIters || (i >= 2 && performance.now() - start > budgetMs)) {
			return best;
		}
	}
}

const iters = (mpx: number) => (mpx > 8 ? 5 : 20);

function collectFixtures(dir: string): string[] {
	return readdirSync(dir)
		.flatMap((entry) => {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) return collectFixtures(path);
			return path.endsWith(".png") ? [path] : [];
		})
		.sort();
}

function arg(name: string): string | undefined {
	const args = process.argv.slice(2);
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
	const zunePath = arg("zune");
	const output = arg("output");
	if (!zunePath || !output) {
		throw new Error("usage: --zune <zune.wasm> --output <json>");
	}
	const fixturesDir =
		arg("fixtures") ?? join(__dirname, "../../../../fixtures");

	const codecs = [
		await blazediffCodec(),
		await zuneCodec(zunePath),
		await jsquashCodec(),
	];
	const [blazediff] = codecs;
	const fixtures = collectFixtures(fixturesDir);

	// V8 compiles wasm in tiers; run every path once a few times so no codec
	// pays its optimizing compile inside a timed call.
	const warmup = new Uint8Array(readFileSync(fixtures[0]));
	const warmupImage = (await blazediff.decode(warmup)) as RgbaImage;
	for (const codec of codecs) {
		for (let i = 0; i < 10; i++) {
			await codec.decode(warmup);
			await codec.encodeNone?.(warmupImage);
			await codec.encodeDefault(warmupImage);
		}
	}

	const rows = [];
	for (const path of fixtures) {
		const name = relative(fixturesDir, path);
		const bytes = new Uint8Array(readFileSync(path));
		// blazediff's decode is the RGBA8 source for every encode, and gives
		// the size behind the MPx figure.
		const image = (await blazediff.decode(bytes)) as RgbaImage;
		const mpx = (image.width * image.height) / 1e6;
		const n = iters(mpx);

		const row = {
			name,
			mpx,
			dec: [] as number[],
			encNone: [] as (number | null)[],
			sizeNone: [] as (number | null)[],
			encDefault: [] as number[],
			sizeDefault: [] as number[],
		};
		for (const codec of codecs) {
			row.dec.push(await timed(n, 800, () => codec.decode(bytes)));
			const { encodeNone } = codec;
			if (encodeNone) {
				row.sizeNone.push((await encodeNone(image)).length);
				row.encNone.push(await timed(n, 1500, () => encodeNone(image)));
			} else {
				row.sizeNone.push(null);
				row.encNone.push(null);
			}
			row.sizeDefault.push((await codec.encodeDefault(image)).length);
			row.encDefault.push(
				await timed(n, 1500, () => codec.encodeDefault(image)),
			);
		}
		rows.push(row);
		console.log(
			`${name.padEnd(24)} decode ${row.dec.map((v) => v.toFixed(2).padStart(9)).join("")}`,
		);
	}

	writeFileSync(
		output,
		JSON.stringify(
			{
				names: codecs.map((c) => c.name),
				encodeLevels: {
					none: codecs.map((c) => c.levelNone),
					default: codecs.map((c) => c.levelDefault),
				},
				rows,
			},
			null,
			2,
		),
	);
	console.log(`\nResults saved to ${output}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
