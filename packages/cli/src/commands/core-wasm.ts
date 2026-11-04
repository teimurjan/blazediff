#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parseCoreArgs, runCoreDiff, SHARED_FLAGS } from "./_core-shared";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core-wasm <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
${SHARED_FLAGS}
  --codec <name>            Codec to use (pngjs, sharp, jsquash-png)
  -h, --help                Show this help message

Examples:
  blazediff-cli core-wasm image1.png image2.png
  blazediff-cli core-wasm image1.png image2.png -o diff.png -t 0.05
  blazediff-cli core-wasm image1.png image2.png --no-antialiasing --background transparent
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

		await runCoreDiff(parsed, wasmDiff);
	} catch (error) {
		console.error(
			"Error:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(2);
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
