#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import type { Image } from "@blazediff/core";
import { parseCoreArgs, runCoreDiff } from "./_core-shared";

// wasm-bindgen's diffRgba expects Uint8Array. Buffer already extends it;
// Uint8ClampedArray needs a same-buffer view.
const toUint8Array = (data: Image["data"]): Uint8Array =>
	data instanceof Uint8Array
		? data
		: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core-wasm <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>       Output path for the diff image
  -t, --threshold <num>     Matching threshold (0 to 1, default: 0.1)
  --include-aa              Include anti-aliasing detection
  --diff-mask               Draw diff over transparent background
  --codec <name>            Specify codec to use (pngjs, sharp, jsquash-png)
  -h, --help                Show this help message

Examples:
  blazediff-cli core-wasm image1.png image2.png
  blazediff-cli core-wasm image1.png image2.png -o diff.png -t 0.05
  blazediff-cli core-wasm image1.png image2.png --include-aa --diff-mask
`);
}

// @blazediff/core-wasm is ESM-only; the wasm-bindgen glue relies on
// import.meta.url to locate blazediff_bg.wasm. Load via Function-wrapped
// import() to bypass CJS bundler downgrading to require().
const loadWasm = () =>
	Function('return import("@blazediff/core-wasm")')() as Promise<
		typeof import("@blazediff/core-wasm")
	>;

export default async function main(): Promise<void> {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
			printUsage();
			process.exit(0);
		}

		const { diff: wasmDiff, initBlazediff } = await loadWasm();
		// wasm-bindgen `--target web` glue tries fetch(file://...) which Node's
		// fetch rejects. Resolve the .wasm file via the package's exports map
		// and feed raw bytes to initBlazediff instead.
		const wasmPath = require.resolve(
			"@blazediff/core-wasm/wasm/blazediff_bg.wasm",
		);
		await initBlazediff(await readFile(wasmPath));
		const parsed = parseCoreArgs(args, printUsage);

		await runCoreDiff(parsed, (a, b, width, height, output, options) =>
			wasmDiff(
				toUint8Array(a),
				toUint8Array(b),
				width,
				height,
				output ? toUint8Array(output) : undefined,
				{
					threshold: options.threshold,
					includeAA: options.includeAA,
					diffMask: options.diffMask,
				},
			),
		);
	} catch (error) {
		console.error(
			"Error:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
