import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: true,
		shims: false,
		external: ["vitest"],
	},
	{
		entry: ["src/index.ts"],
		format: ["cjs"],
		dts: { only: true },
	},
]);
