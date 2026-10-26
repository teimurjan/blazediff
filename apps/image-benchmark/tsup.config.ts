import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/**/*.ts"],
	format: ["cjs"],
	dts: false,
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	// Keep the native/wasm packages out of the bundle so they resolve their
	// platform binaries at runtime instead of being inlined.
	external: [
		"@blazediff/codec-png-wasm",
		"@blazediff/core-native",
		"@blazediff/core-wasm",
		"@blazediff/ssim-native",
		"@jsquash/png",
		"@vizzly-testing/honeydiff",
	],
});
