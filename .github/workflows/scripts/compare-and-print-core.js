const { compareAndPrint } = require("./compare-and-print.js");

// JS core benches now emit two tasks per fixture: `<name> - <fixture>` (no
// output buffer) and `<name> (w\\ output) - <fixture>` (with output buffer).
// Print one table per variant — otherwise the Map<fixture> in compareAndPrint
// collapses duplicates and pairs the no-output row against the with-output
// row, which manifests as huge bogus regressions on identical fixtures.
const shared = {
	fileA: "apps/image-benchmark/pixelmatch.json",
	fileB: "apps/image-benchmark/blazediff.json",
	nameA: "Pixelmatch",
	nameB: "BlazeDiff",
	precision: 2,
};

console.log(
	"### JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)\n",
);
compareAndPrint({
	...shared,
	prefixA: "pixelmatch",
	prefixB: "blazediff",
});

console.log(
	"\n### JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)\n",
);
compareAndPrint({
	...shared,
	prefixA: "pixelmatch (w\\ output)",
	prefixB: "blazediff (w\\ output)",
});
