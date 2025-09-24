import { copyFileSync, existsSync } from "node:fs";
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
		// Copy Rust WASM files
		const rustWasmSrc = join(
			__dirname,
			"./node_modules/@blazediff/wasm/pkg/blazediff_wasm_bg.wasm",
		);
		const rustWasmDest = join(__dirname, "dist/blazediff_wasm_bg.wasm");
		if (existsSync(rustWasmSrc)) {
			copyFileSync(rustWasmSrc, rustWasmDest);
		}

		const rustJsSrc = join(
			__dirname,
			"./node_modules/@blazediff/wasm/pkg/blazediff_wasm.js",
		);
		const rustJsDest = join(__dirname, "dist/blazediff_wasm.js");
		if (existsSync(rustJsSrc)) {
			copyFileSync(rustJsSrc, rustJsDest);
		}
	},
});
