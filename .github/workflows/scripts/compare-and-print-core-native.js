const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	precision: 2,
	series: [
		{ file: "apps/image-benchmark/odiff.json", name: "ODiff" },
		{ file: "apps/image-benchmark/blazediff.json", name: "BlazeDiff" },
		{
			file: "apps/image-benchmark/blazediff-next.json",
			name: "BlazeDiff Next",
		},
	],
});
