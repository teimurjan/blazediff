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
			"commands/diff": "src/commands/diff.ts",
			"commands/gmsd": "src/commands/gmsd.ts",
			"commands/ssim": "src/commands/ssim.ts",
			"commands/msssim": "src/commands/msssim.ts",
			"commands/hitchhikers-ssim": "src/commands/hitchhikers-ssim.ts",
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
