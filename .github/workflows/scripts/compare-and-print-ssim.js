const { compareAndPrint } = require("./compare-and-print.js");

compareAndPrint({
	fileA: "packages/benchmark/ssim-js.json",
	fileB: "packages/benchmark/ssim.json",
	nameA: "ssim.js",
	nameB: "BlazeDiff",
	precision: 2,
});
