import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // Copy the entire pkg directory which includes the WASM files
  publicDir: "pkg",
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.wasm': 'file',
    };
    // Exclude the WASM module from bundling - we want to load it dynamically
    options.external = [...(options.external || []), './pkg/blazediff_wasm.js', '../pkg/blazediff_wasm.js'];
  },
});
