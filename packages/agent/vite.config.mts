import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the review SPA to dist/review/client/, served at runtime by the
// zero-dep Node server in src/review/server.ts.
export default defineConfig({
	root: path.resolve(import.meta.dirname, "src/review/client"),
	base: "./",
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/review/client"),
		emptyOutDir: true,
	},
	plugins: [react(), tailwindcss()],
	// @blazediff/react resolves its own react from its devDeps; one copy keeps hooks working.
	resolve: { dedupe: ["react", "react-dom"] },
	server: {
		port: 5279,
		// Dev HMR: proxy API calls to a running `blazediff-agent review`.
		proxy: { "/api": "http://127.0.0.1:4321" },
	},
});
