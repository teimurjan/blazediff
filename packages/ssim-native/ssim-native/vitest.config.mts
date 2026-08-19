import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		exclude: [...configDefaults.exclude, "**/*.deno.test.ts"],
		// Parity cases diff 4k fixtures through both engines; the slowest sit at
		// ~4s on CI hardware, well past a comfortable margin under the 5s default.
		testTimeout: 30_000,
	},
});
