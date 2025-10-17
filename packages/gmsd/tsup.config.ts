import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/internal.ts"],
	format: ["cjs", "esm"],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	treeshake: true,
	minify: true,
	shims: false,
});
