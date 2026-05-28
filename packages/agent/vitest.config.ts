import { defineConfig } from "vitest/config";

// Dedicated config so vitest doesn't inherit vite.config.ts (which sets `root`
// to the review client for the SPA build).
export default defineConfig({
	test: {
		root: __dirname,
	},
});
