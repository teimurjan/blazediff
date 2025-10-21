const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "packages/benchmark/microdiff.json",
	fileB: "packages/benchmark/blazediff.json",
	nameA: "Microdiff",
	nameB: "BlazeDiff",
	precision: 4,
});
