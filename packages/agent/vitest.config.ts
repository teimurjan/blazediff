import { defineConfig } from "vitest/config";

// Dedicated config so vitest doesn't inherit vite.config.ts (which sets `root`
// to the review client for the SPA build).
//
// NO_COLOR pins picocolors off in the test process. `pnpm -r test` runs with
// FORCE_COLOR=1 when its own stdout is a TTY, which would otherwise leak ANSI
// escapes into the plain-text assertions in cli/render and cli/progress.
export default defineConfig({
	test: {
		root: __dirname,
		env: { NO_COLOR: "1" },
	},
});
