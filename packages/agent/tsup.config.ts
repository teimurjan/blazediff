import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: ["cjs", "esm"],
		dts: { only: false },
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: false,
		external: ["playwright", "@blazediff/core-native"],
	},
	{
		entry: { cli: "src/cli.ts" },
		format: "cjs",
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: false,
		treeshake: true,
		minify: false,
		external: ["playwright", "@blazediff/core-native"],
		banner: { js: "#!/usr/bin/env node" },
	},
]);
