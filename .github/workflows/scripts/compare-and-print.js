const fs = require("node:fs");

/**
 * Compare two benchmark JSON files and print a formatted comparison table.
 *
 * When a JSON file contains multiple variants per fixture (e.g. both
 * `pixelmatch - 4k/1` and `pixelmatch (w\\ output) - 4k/1`), pass
 * `prefixA` / `prefixB` to keep only the variant you want — otherwise the
 * map keyed by the part after `" - "` collapses duplicates and the output
 * pairs every left row against the last-loaded right row.
 *
 * @param {Object} config - Configuration object
 * @param {string} config.fileA - Path to first benchmark JSON file
 * @param {string} config.fileB - Path to second benchmark JSON file
 * @param {string} config.nameA - Name of first library (for table header)
 * @param {string} config.nameB - Name of second library (for table header)
 * @param {number} [config.precision=2] - Decimal precision for numbers (default: 2)
 * @param {string} [config.prefixA] - Optional tinybench task prefix filter for fileA
 * @param {string} [config.prefixB] - Optional tinybench task prefix filter for fileB
 */
function compareAndPrint({
	fileA,
	fileB,
	nameA,
	nameB,
	precision = 2,
	prefixA,
	prefixB,
}) {
	const rawA = JSON.parse(fs.readFileSync(fileA, "utf8"));
	const rawB = JSON.parse(fs.readFileSync(fileB, "utf8"));

	const filterByPrefix = (entries, prefix) => {
		if (!prefix) return entries;
		const needle = `${prefix} - `;
		return entries.filter(
			(r) => typeof r.name === "string" && r.name.startsWith(needle),
		);
	};
	const a = filterByPrefix(rawA, prefixA);
	const b = filterByPrefix(rawB, prefixB);

	const stripPrefix = (name) => name.split(" - ")[1];
	const byName = new Map(b.map((r) => [stripPrefix(r.name), r]));

	const rows = [];
	for (const r of a) {
		const key = stripPrefix(r.name);
		const m = byName.get(key);
		if (!m) continue;
		const aLatency = r.latency.mean;
		const bLatency = m.latency.mean;
		const saved = aLatency - bLatency;
		const pct = aLatency ? (saved / aLatency) * 100 : 0;
		rows.push([
			key,
			`${aLatency.toFixed(precision)}ms`,
			`${bLatency.toFixed(precision)}ms`,
			`${saved.toFixed(precision)}ms`,
			`${pct.toFixed(1)}%`,
		]);
	}
	rows.sort((x, y) => x[0].localeCompare(y[0]));

	const sum = (arr) => arr.reduce((s, v) => s + v, 0);
	const aTotal = sum(a.map((x) => x.latency.mean));
	const bTotal = sum(b.map((x) => x.latency.mean));
	const savedTotal = aTotal - bTotal;
	const pctTotal = aTotal ? (savedTotal / aTotal) * 100 : 0;

	const head = ["Benchmark", nameA, nameB, "Time Saved", "% Improvement"];

	const padColumns = (row, widths) => {
		return row.map((cell, i) => cell.padEnd(widths[i])).join(" | ");
	};

	const allRows = [
		head,
		...rows,
		[
			"**TOTAL**",
			`**${aTotal.toFixed(precision)}ms**`,
			`**${bTotal.toFixed(precision)}ms**`,
			`**${savedTotal.toFixed(precision)}ms**`,
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
		`| ${padColumns(["**TOTAL**", `**${aTotal.toFixed(precision)}ms**`, `**${bTotal.toFixed(precision)}ms**`, `**${savedTotal.toFixed(precision)}ms**`, `**${pctTotal.toFixed(1)}%**`], widths)} |`,
	);
	console.log([header, sep, ...lines].join("\n"));
}

module.exports = { compareAndPrint };
