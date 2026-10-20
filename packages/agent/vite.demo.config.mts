import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dirname = import.meta.dirname;

// Builds the review SPA against static demo data for the website's /agent page.
export default defineConfig({
	root: path.resolve(dirname, "src/review/client"),
	base: "./",
	publicDir: path.resolve(dirname, "src/review/demo/public"),
	build: {
		outDir: path.resolve(dirname, "../../apps/website/public/review-demo"),
		emptyOutDir: true,
	},
	plugins: [react(), tailwindcss()],
	resolve: {
		dedupe: ["react", "react-dom"],
		// The client imports its server calls as "./api"; the demo serves files instead.
		alias: [
			{
				find: /^\.\/api$/,
				replacement: path.resolve(dirname, "src/review/demo/api.ts"),
			},
		],
	},
});
