import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		format: ["cjs", "esm"],
		dts: true,
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: true,
	},
	{
		entry: {
			cli: "src/cli.ts",
		},
		format: "cjs",
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: false,
		treeshake: false,
		minify: false,
		noExternal: ["@blazediff/*"],
	},
]);
