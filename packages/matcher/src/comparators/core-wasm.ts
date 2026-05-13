import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { ImageData, MatcherOptions } from "../types";

// createRequire works in both CJS and ESM contexts (esbuild's `shims: true`
// supplies import.meta.url for the CJS bundle). Built-in `require.resolve`
// from esbuild's CJS shim doesn't carry `.resolve` in ESM output.
const cwRequire = createRequire(import.meta.url);

export interface CoreWasmComparisonResult {
	diffCount: number;
	diffPercentage: number;
	diffOutput?: Uint8Array;
}

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

/**
 * Compare images using @blazediff/core-wasm (WebAssembly).
 */
export async function compareCoreWasm(
	received: ImageData,
	baseline: ImageData,
	generateDiff: boolean,
	options: MatcherOptions,
): Promise<CoreWasmComparisonResult> {
	const { width, height } = received;
	const totalPixels = width * height;

	if (
		received.width !== baseline.width ||
		received.height !== baseline.height
	) {
		return {
			diffCount: totalPixels,
			diffPercentage: 100,
		};
	}

	const output = generateDiff ? new Uint8Array(totalPixels * 4) : undefined;
	const { diff } = await getWasm();
	const diffCount = await diff(
		received.data,
		baseline.data,
		width,
		height,
		output,
		{
			threshold: options.threshold ?? 0.1,
			includeAA: options.includeAA ?? false,
		},
	);

	return {
		diffCount,
		diffPercentage: (diffCount / totalPixels) * 100,
		diffOutput: output,
	};
}
