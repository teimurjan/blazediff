const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "apps/image-benchmark/pixelmatch.json",
	fileB: "apps/image-benchmark/blazediff.json",
	nameA: "Pixelmatch",
	nameB: "BlazeDiff",
	precision: 2,
});
