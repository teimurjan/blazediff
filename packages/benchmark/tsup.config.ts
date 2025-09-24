import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/**/*.ts"],
	format: ["cjs"],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
});
