const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "apps/object-benchmark/microdiff.json",
	fileB: "apps/object-benchmark/blazediff.json",
	nameA: "Microdiff",
	nameB: "BlazeDiff",
	precision: 4,
});
