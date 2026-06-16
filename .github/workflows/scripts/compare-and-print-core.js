const { compareAndPrint } = require("./compare-and-print.js");

// JS core benches now emit two tasks per fixture: `<name> - <fixture>` (no
// output buffer) and `<name> (w\\ output) - <fixture>` (with output buffer).
// Print one table per variant — otherwise the Map<fixture> in compareAndPrint
// collapses duplicates and pairs the no-output row against the with-output
// row, which manifests as huge bogus regressions on identical fixtures.
const pixelmatch = "apps/image-benchmark/pixelmatch.json";
const blazediff = "apps/image-benchmark/blazediff.json";

console.log(
	"### JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)\n",
);
compareAndPrint({
	precision: 2,
	series: [
		{ file: pixelmatch, name: "Pixelmatch", prefix: "pixelmatch" },
		{ file: blazediff, name: "BlazeDiff", prefix: "blazediff" },
	],
});

console.log(
	"\n### JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)\n",
);
compareAndPrint({
	precision: 2,
	series: [
		{ file: pixelmatch, name: "Pixelmatch", prefix: "pixelmatch (w\\ output)" },
		{ file: blazediff, name: "BlazeDiff", prefix: "blazediff (w\\ output)" },
	],
});
