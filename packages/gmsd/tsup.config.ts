import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts", "src/internal.ts"],
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
		entry: ["src/index.ts", "src/internal.ts"],
		format: ["cjs"],
		dts: { only: true },
	},
]);
