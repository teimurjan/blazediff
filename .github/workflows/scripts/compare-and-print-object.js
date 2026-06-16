const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	precision: 4,
	series: [
		{ file: "apps/object-benchmark/microdiff.json", name: "Microdiff" },
		{ file: "apps/object-benchmark/blazediff.json", name: "BlazeDiff" },
	],
});
