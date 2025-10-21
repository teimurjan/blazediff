import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/ssim.ts", "src/msssim.ts", "src/hitchhikers-ssim.ts"],
	format: ["cjs", "esm"],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	treeshake: true,
	minify: true,
	shims: false,
});
