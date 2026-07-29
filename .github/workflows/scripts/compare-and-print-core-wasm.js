const { compareAndPrint } = require("./compare-and-print.js");

// The wasm bench emits both series into its own JSON (`core-wasm - <fixture>`
// and `pixelmatch - <fixture>`), while the standalone pixelmatch bench writes
// its own file. Read the baseline from the dedicated pixelmatch run so this
// table is built the same way `pnpm bench core-wasm` builds it locally, and
// set prefixes so the fixture-keyed map cannot pair mismatched variants.
const pixelmatch = "apps/image-benchmark/pixelmatch.json";
const blazediffWasm = "apps/image-benchmark/blazediff-wasm.json";

console.log(
	"### WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)\n",
);
compareAndPrint({
	precision: 2,
	series: [
		{ file: pixelmatch, name: "Pixelmatch", prefix: "pixelmatch" },
		{
			file: blazediffWasm,
			name: "BlazeDiff (core-wasm)",
			prefix: "core-wasm",
		},
	],
});
