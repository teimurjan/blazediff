import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: ["cjs", "esm"],
		dts: false,
		splitting: false,
		sourcemap: true,
		clean: true,
		external: ["react", "react-dom", "@blazediff/ui", "@blazediff/ui/engine"],
	},
	{
		entry: ["src/index.ts"],
		format: ["cjs"],
		dts: { only: true },
	},
]);
