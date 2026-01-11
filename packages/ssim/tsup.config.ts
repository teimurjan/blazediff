import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/ssim.ts", "src/msssim.ts", "src/hitchhikers-ssim.ts"],
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
		entry: ["src/ssim.ts", "src/msssim.ts", "src/hitchhikers-ssim.ts"],
		format: ["cjs"],
		dts: { only: true },
	},
]);
