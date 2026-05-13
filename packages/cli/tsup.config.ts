import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
		},
		format: ["cjs", "esm"],
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: true,
	},
	{
		entry: {
			index: "src/index.ts",
		},
		format: ["cjs"],
		dts: { only: true },
	},
	{
		entry: {
			cli: "src/cli.ts",
			"commands/core-native": "src/commands/core-native.ts",
			"commands/core": "src/commands/core.ts",
			"commands/core-wasm": "src/commands/core-wasm.ts",
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
			"@blazediff/codec-pngjs",
			"@blazediff/codec-sharp",
			"@blazediff/codec-jsquash-png",
		],
		// core-native: binary paths rely on __dirname.
		// core-wasm: ESM-only, loaded via Function-wrapped import() at runtime.
		external: ["@blazediff/core-native", "@blazediff/core-wasm"],
	},
]);
