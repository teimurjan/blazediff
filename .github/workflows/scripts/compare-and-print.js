const fs = require("node:fs");

/**
 * Compare N benchmark JSON files and print a formatted comparison table.
 *
 * The first series is the baseline; every other series gets a latency column
 * plus "saved" / "%" columns measured against that baseline.
 *
 * When a JSON file contains multiple variants per fixture (e.g. both
 * `pixelmatch - 4k/1` and `pixelmatch (w\\ output) - 4k/1`), set a `prefix`
 * on the series to keep only the variant you want — otherwise the map keyed
 * by the part after `" - "` collapses duplicates and pairs every baseline row
 * against the last-loaded row.
 *
 * @param {Object} config - Configuration object
 * @param {Array<{file: string, name: string, prefix?: string}>} config.series
 *   Benchmark series to compare; the first entry is the baseline.
 * @param {number} [config.precision=2] - Decimal precision for numbers
 */
function compareAndPrint({ series, precision = 2 }) {
	if (!series || series.length < 2) {
		throw new Error("compareAndPrint needs at least two series to compare");
	}

	const filterByPrefix = (entries, prefix) => {
		if (!prefix) return entries;
		const needle = `${prefix} - `;
		return entries.filter(
			(r) => typeof r.name === "string" && r.name.startsWith(needle),
		);
	};
	const stripPrefix = (name) => name.split(" - ")[1];

	const loaded = series.map((s) => {
		const raw = JSON.parse(fs.readFileSync(s.file, "utf8"));
		const entries = filterByPrefix(raw, s.prefix);
		return {
			name: s.name,
			entries,
			byName: new Map(entries.map((r) => [stripPrefix(r.name), r])),
			total: entries.reduce((sum, x) => sum + x.latency.mean, 0),
		};
	});

	const [baseline, ...others] = loaded;

	const fmtMs = (v) => `${v.toFixed(precision)}ms`;
	const fmtPct = (saved, base) =>
		`${(base ? (saved / base) * 100 : 0).toFixed(1)}%`;

	// Keep the original two-column labels when there's a single comparison
	// series so existing benchmark tables stay byte-identical.
	const savedLabel = (s) =>
		others.length === 1 ? "Time Saved" : `${s.name} Saved`;
	const pctLabel = (s) =>
		others.length === 1 ? "% Improvement" : `${s.name} %`;

	const head = ["Benchmark"];
	for (const s of loaded) head.push(s.name);
	for (const s of others) head.push(savedLabel(s), pctLabel(s));

	const rows = [];
	for (const r of baseline.entries) {
		const key = stripPrefix(r.name);
		const matches = others.map((s) => s.byName.get(key));
		if (matches.some((m) => !m)) continue;
		const baseLatency = r.latency.mean;
		const row = [key, fmtMs(baseLatency)];
		for (const m of matches) row.push(fmtMs(m.latency.mean));
		for (const m of matches) {
			const saved = baseLatency - m.latency.mean;
			row.push(fmtMs(saved), fmtPct(saved, baseLatency));
		}
		rows.push(row);
	}
	rows.sort((x, y) => x[0].localeCompare(y[0]));

	const totalRow = ["**TOTAL**", `**${fmtMs(baseline.total)}**`];
	for (const s of others) totalRow.push(`**${fmtMs(s.total)}**`);
	for (const s of others) {
		const saved = baseline.total - s.total;
		totalRow.push(
			`**${fmtMs(saved)}**`,
			`**${fmtPct(saved, baseline.total)}**`,
		);
	}

	const padColumns = (row, widths) =>
		row.map((cell, i) => cell.padEnd(widths[i])).join(" | ");

	const allRows = [head, ...rows, totalRow];
	const widths = head.map((_, colIndex) =>
		Math.max(...allRows.map((row) => row[colIndex].length)),
	);

	const header = `| ${padColumns(head, widths)} |`;
	const sep = `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`;
	const lines = [...rows, totalRow].map((r) => `| ${padColumns(r, widths)} |`);
	console.log([header, sep, ...lines].join("\n"));
}

module.exports = { compareAndPrint };
