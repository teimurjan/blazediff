const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "packages/benchmark/pixelmatch.json",
	fileB: "packages/benchmark/blazediff.json",
	nameA: "Pixelmatch",
	nameB: "BlazeDiff",
	precision: 2,
});
