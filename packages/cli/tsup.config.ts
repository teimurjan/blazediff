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
			"commands/bin": "src/commands/bin.ts",
			"commands/core": "src/commands/core.ts",
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
		noExternal: [
			"@blazediff/core",
			"@blazediff/gmsd",
			"@blazediff/ssim",
			"@blazediff/pngjs-transformer",
			"@blazediff/sharp-transformer",
		],
		external: ["@blazediff/bin"], // Don't bundle - binary path relies on __dirname
	},
]);
