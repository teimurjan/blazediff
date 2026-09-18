import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: [...configDefaults.exclude, "**/*.deno.test.ts"],
		// The metric is a CNN; the largest fixture pair takes about a second on
		// every core, longer on a loaded CI runner.
		testTimeout: 60_000,
	},
});
