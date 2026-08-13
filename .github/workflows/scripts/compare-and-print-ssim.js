const { compareAndPrint } = require("./compare-and-print.js");

// The JS and Rust ports are benchmarked in one run, so both series come out of
// ssim.json and need a task prefix to tell them apart. "ssim" does not match
// "ssim-native - X" — the filter is an exact `${prefix} - ` match.
compareAndPrint({
	precision: 2,
	series: [
		{ file: "apps/image-benchmark/ssim-js.json", name: "ssim.js" },
		{
			file: "apps/image-benchmark/ssim.json",
			name: "BlazeDiff",
			prefix: "ssim",
		},
		{
			file: "apps/image-benchmark/ssim.json",
			name: "BlazeDiff (ssim-native)",
			prefix: "ssim-native",
		},
	],
});
