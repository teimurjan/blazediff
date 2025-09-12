const fs = require("node:fs");
const a = JSON.parse(
	fs.readFileSync("packages/benchmark/pixelmatch.json", "utf8"),
);
const b = JSON.parse(
	fs.readFileSync("packages/benchmark/blazediff.json", "utf8"),
);
const byName = new Map(b.map((r) => [r.name, r]));
const rows = [];
for (const r of a) {
	const m = byName.get(r.name);
	if (!m) continue;
	const px = r.average;
	const bz = m.average;
	const saved = px - bz;
	const pct = px ? (saved / px) * 100 : 0;
	rows.push([
		r.name,
		`${px.toFixed(2)}ms`,
		`${bz.toFixed(2)}ms`,
		`${saved.toFixed(2)}ms`,
		`${pct.toFixed(1)}%`,
	]);
}
rows.sort((x, y) => x[0].localeCompare(y[0]));
const sum = (arr) => arr.reduce((s, v) => s + v, 0);
const pxTotal = sum(a.map((x) => x.average));
const bzTotal = sum(b.map((x) => x.average));
const savedTotal = pxTotal - bzTotal;
const pctTotal = pxTotal ? (savedTotal / pxTotal) * 100 : 0;
const head = [
	"Benchmark",
	"Pixelmatch",
	"BlazeDiff",
	"Time Saved",
	"% Improvement",
];

// Function to pad strings to equal width
const padColumns = (row, widths) => {
	return row.map((cell, i) => cell.padEnd(widths[i])).join(" | ");
};

// Calculate column widths based on content
const allRows = [
	head,
	...rows,
	[
		"**TOTAL**",
		`**${pxTotal.toFixed(2)}ms**`,
		`**${bzTotal.toFixed(2)}ms**`,
		`**${savedTotal.toFixed(2)}ms**`,
		`**${pctTotal.toFixed(1)}%**`,
	],
];
const widths = head.map((_, colIndex) =>
	Math.max(...allRows.map((row) => row[colIndex].length)),
);

const header = `| ${padColumns(head, widths)} |`;
const sep = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
const lines = rows.map((r) => `| ${padColumns(r, widths)} |`);
lines.push(
	`| ${padColumns(["**TOTAL**", `**${pxTotal.toFixed(2)}ms**`, `**${bzTotal.toFixed(2)}ms**`, `**${savedTotal.toFixed(2)}ms**`, `**${pctTotal.toFixed(1)}%**`], widths)} |`,
);
console.log([header, sep, ...lines].join("\n"));
