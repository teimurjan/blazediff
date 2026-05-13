import { defineConfig } from "tsup";

// ESM-only: the wasm-bindgen JS glue uses `import.meta.url` to locate
// the .wasm sibling. Keep that glue external so its `import.meta.url`
// stays anchored to `wasm/blazediff.js` and resolves `blazediff_bg.wasm`
// in the same directory — bundling would re-anchor it to dist/.
export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	treeshake: true,
	minify: true,
	shims: false,
	external: [/^\.\.\/wasm\//],
});
