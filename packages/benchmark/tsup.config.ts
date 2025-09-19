import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/**/*.ts"],
	format: ["cjs"],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	onSuccess: async () => {
		const wasmSrc = join(__dirname, "./node_modules/@blazediff/wasm/build/release.wasm");
		const wasmDest = join(__dirname, "dist/release.wasm");
		copyFileSync(wasmSrc, wasmDest);
	},
});
