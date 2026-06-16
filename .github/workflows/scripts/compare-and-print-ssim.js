const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	precision: 2,
	series: [
		{ file: "apps/image-benchmark/ssim-js.json", name: "ssim.js" },
		{ file: "apps/image-benchmark/ssim.json", name: "BlazeDiff" },
	],
});
