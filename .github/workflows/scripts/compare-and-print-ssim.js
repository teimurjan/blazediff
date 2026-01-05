const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "apps/image-benchmark/ssim-js.json",
	fileB: "apps/image-benchmark/ssim.json",
	nameA: "ssim.js",
	nameB: "BlazeDiff",
	precision: 2,
});
