const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "apps/image-benchmark/odiff.json",
	fileB: "apps/image-benchmark/blazediff.json",
	nameA: "ODiff",
	nameB: "BlazeDiff",
	precision: 2,
});
