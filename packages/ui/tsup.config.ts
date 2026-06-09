import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
			engine: "src/engine/index.ts",
		},
		format: ["cjs", "esm"],
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: true,
		shims: false,
	},
	{
		entry: {
			index: "src/index.ts",
			engine: "src/engine/index.ts",
		},
		format: ["cjs"],
		dts: { only: true },
	},
]);
