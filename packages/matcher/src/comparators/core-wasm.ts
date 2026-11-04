import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { ImageData, MatcherOptions } from "../types";
import {
	blankLike,
	type PixelComparisonResult,
	toPixelResult,
} from "./pixel-result";

// createRequire works in both CJS and ESM contexts (esbuild's `shims: true`
// supplies import.meta.url for the CJS bundle). Built-in `require.resolve`
// from esbuild's CJS shim doesn't carry `.resolve` in ESM output.
const cwRequire = createRequire(import.meta.url);

let wasmReady: Promise<typeof import("@blazediff/core-wasm")> | undefined;

function getWasm(): Promise<typeof import("@blazediff/core-wasm")> {
	if (!wasmReady) {
		wasmReady = import("@blazediff/core-wasm").then(async (mod) => {
			// wasm-bindgen `--target web` glue uses fetch(file://...) which
			// Node's fetch rejects. Pre-feed the .wasm bytes via the package's
			// exports map.
			const wasmPath = cwRequire.resolve(
				"@blazediff/core-wasm/wasm/blazediff_bg.wasm",
			);
			await mod.initBlazediff(await readFile(wasmPath));
			return mod;
		});
	}
	return wasmReady;
}

/** Compare images using @blazediff/core-wasm (WebAssembly). */
export async function compareCoreWasm(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): Promise<PixelComparisonResult> {
	const output = generateDiff ? blankLike(received) : undefined;
	const { diff } = await getWasm();
	return toPixelResult(
		await diff(received, baseline, { ...options.diff, output }),
		output,
	);
}
