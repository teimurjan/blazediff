import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	sourcemap: false,
	minify: false,
	target: "node18",
	shims: true, // Provides __dirname and __filename shims for ESM
});
