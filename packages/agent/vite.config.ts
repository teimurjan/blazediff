import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the review SPA to dist/review/client/, served at runtime by the
// zero-dep Node server in src/review/server.ts.
export default defineConfig({
	root: path.resolve(__dirname, "src/review/client"),
	base: "./",
	build: {
		outDir: path.resolve(__dirname, "dist/review/client"),
		emptyOutDir: true,
	},
	plugins: [react()],
	server: {
		port: 5279,
		// Dev HMR: proxy API calls to a running `blazediff-agent review`.
		proxy: { "/api": "http://127.0.0.1:4321" },
	},
});
