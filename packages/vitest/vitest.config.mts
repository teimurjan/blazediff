import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: [...configDefaults.exclude, "**/*.deno.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"dist/",
				"*.config.ts",
				"*.config.mts",
				"**/*.test.ts",
			],
		},
	},
});
