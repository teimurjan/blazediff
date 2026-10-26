import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: false,
		clean: true,
		sourcemap: false,
		minify: false,
		target: "node18",
		shims: true,
	},
	{
		entry: ["src/index.ts"],
		format: ["cjs"],
		dts: { only: true },
	},
]);
