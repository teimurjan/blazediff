import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
			"difference-mode": "src/difference-mode.ts",
			"swipe-mode": "src/swipe-mode.ts",
			"two-up-mode": "src/two-up-mode.ts",
			"onion-skin-mode": "src/onion-skin-mode.ts",
			"base-element": "src/base-element.ts",
		},
		format: ["cjs", "esm"],
		dts: false,
		splitting: false,
		sourcemap: false,
		clean: true,
		treeshake: true,
		minify: true,
		shims: false,
	},
	{
		entry: {
			index: "src/index.ts",
			"difference-mode": "src/difference-mode.ts",
			"swipe-mode": "src/swipe-mode.ts",
			"two-up-mode": "src/two-up-mode.ts",
			"onion-skin-mode": "src/onion-skin-mode.ts",
			"base-element": "src/base-element.ts",
		},
		format: ["cjs"],
		dts: { only: true },
	},
]);
