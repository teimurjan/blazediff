#!/usr/bin/env node
/**
 * Patch the table, iterations line, and average-improvement blockquote for
 * one BENCHMARKS.md section per pair variant.
 *
 * A pair may be:
 *   - single-section (legacy): `pair.section` + optional `taskPrefix` per side.
 *   - multi-variant: `pair.variants = [{ section, leftTaskPrefix,
 *     rightTaskPrefix }, ...]`. Each variant is patched from the same input
 *     JSON files, filtered by its `<Left/Right>TaskPrefix`.
 *
 * Usage:
 *   node update-benchmarks-md.js \
 *     --pair core \
 *     --left apps/image-benchmark/pixelmatch.json \
 *     --right apps/image-benchmark/blazediff.json \
 *     [--iterations 50] [--warmup 5] [--precision 2] \
 *     [--md BENCHMARKS.md]
 */

const fs = require("node:fs");
const path = require("node:path");
const { PAIRS } = require("./pairs.js");

const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
	const out = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const k = a.replace(/^--/, "");
		const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
		out[k] = v;
	}
	return out;
}

/**
 * Load tinybench JSON. If `prefix` is given, only return entries whose name
 * begins with `${prefix} - ` (exact prefix match). The remaining substring
 * after " - " is used as the row key. With no prefix, falls back to legacy
 * behavior: strip everything up to the first " - ".
 */
function loadResults(p, prefix) {
	const raw = JSON.parse(fs.readFileSync(p, "utf8"));
	if (prefix) {
		const needle = `${prefix} - `;
		return raw
			.filter((r) => typeof r.name === "string" && r.name.startsWith(needle))
			.map((r) => ({ key: r.name.slice(needle.length), latency: r.latency }));
	}
	return raw
		.filter((r) => typeof r.name === "string" && r.name.includes(" - "))
		.map((r) => {
			const idx = r.name.indexOf(" - ");
			return { key: r.name.slice(idx + 3), latency: r.latency };
		});
}

/**
 * Build one row per fixture shared by every series. `series[0]` is the
 * baseline; every other series contributes a formatted latency plus a
 * saved/% pair measured against the baseline.
 *
 * @param {Array<{name: string, results: Array<{key, latency}>}>} series
 */
function buildRows(series, precision) {
	const [baseline, ...others] = series;
	const otherMaps = others.map(
		(s) => new Map(s.results.map((r) => [r.key, r])),
	);

	const rows = [];
	for (const base of baseline.results) {
		const matches = otherMaps.map((m) => m.get(base.key));
		if (matches.some((m) => !m)) continue;
		const a = base.latency.mean;
		const cells = [`${a.toFixed(precision)}ms`];
		const comps = [];
		for (const m of matches) {
			const b = m.latency.mean;
			const saved = a - b;
			const pct = a ? (saved / a) * 100 : 0;
			cells.push(`${b.toFixed(precision)}ms`);
			comps.push({
				saved: `${saved.toFixed(precision)}ms`,
				pct: `${pct.toFixed(1)}%`,
				pctNum: pct,
			});
		}
		rows.push({ key: base.key, cells, comps });
	}
	rows.sort((x, y) => x.key.localeCompare(y.key));
	return rows;
}

function buildHtmlTable(rows, seriesNames) {
	const others = seriesNames.slice(1);
	// Keep the original two-column labels for the common two-series case so
	// existing tables stay byte-identical; name them per-series otherwise.
	const savedLabel = (name) =>
		others.length === 1 ? "Time Saved" : `${name} Saved`;
	const pctLabel = (name) =>
		others.length === 1 ? "% Improvement" : `${name} %`;

	const head = ["Benchmark", ...seriesNames];
	for (const name of others) head.push(savedLabel(name), pctLabel(name));

	const lines = [];
	lines.push("<table>");
	lines.push("  <thead>");
	lines.push("    <tr>");
	for (const h of head) lines.push(`      <th width="500">${h}</th>`);
	lines.push("    </tr>");
	lines.push("  </thead>");
	lines.push("  <tbody>");
	for (const r of rows) {
		lines.push("    <tr>");
		lines.push(`      <td>${r.key}</td>`);
		for (const cell of r.cells) lines.push(`      <td>${cell}</td>`);
		for (const c of r.comps) {
			lines.push(`      <td>${c.saved}</td>`);
			lines.push(`      <td>${c.pct}</td>`);
		}
		lines.push("    </tr>");
	}
	lines.push("  </tbody>");
	lines.push("</table>");
	return lines.join("\n");
}

// Average improvement of the primary blazediff series (first non-baseline)
// against the baseline — drives the section's blockquote.
function averagePct(rows) {
	if (!rows.length) return 0;
	const sum = rows.reduce((s, r) => s + r.comps[0].pctNum, 0);
	return sum / rows.length;
}

function findSection(md, heading) {
	// Match `## <heading>` or `### <heading>` (any depth ≥ 2).
	const re = new RegExp(
		`^(#{2,})[ \\t]+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`,
		"m",
	);
	const m = re.exec(md);
	if (!m) return null;
	const start = m.index;
	const startBody = m.index + m[0].length;
	const depth = m[1].length;
	const endRe = new RegExp(`^#{1,${depth}}[ \\t]+\\S`, "m");
	endRe.lastIndex = startBody;
	const after = md.slice(startBody);
	const endMatch = endRe.exec(after);
	const end = endMatch ? startBody + endMatch.index : md.length;
	return { start, startBody, end, depth };
}

/**
 * Insert a fresh section skeleton at `insertAt`. The depth is copied from
 * `siblingSection`. The skeleton has the iterations line, blockquote, and
 * an empty table — `update()` will replace each of them with real values
 * in the same pass.
 */
function insertSectionSkeleton(md, heading, insertAt, siblingSection) {
	const depth = siblingSection ? siblingSection.depth : 3;
	const hashes = "#".repeat(depth);
	const skel = [
		"",
		`${hashes} ${heading}`,
		"",
		"_pending iterations_",
		"",
		"> **~0.0%** performance improvement on average.",
		"",
		"<table></table>",
		"",
	].join("\n");
	return md.slice(0, insertAt) + skel + md.slice(insertAt);
}

function replaceTable(sectionText, newTableHtml) {
	const re = /<table[\s\S]*?<\/table>/;
	if (!re.test(sectionText))
		throw new Error("No <table> block found in section");
	return sectionText.replace(re, newTableHtml);
}

function replaceIterationsLine(sectionText, iterationsLine) {
	const re = /^_[^_\n]*(iterations|runs|warmup|pending)[^_\n]*_$/m;
	if (re.test(sectionText)) return sectionText.replace(re, iterationsLine);
	return sectionText.replace(/^(#{2,}[^\n]+\n)/, `$1\n${iterationsLine}\n`);
}

function replaceAvgPctBlockquote(sectionText, avgPct, precision = 1) {
	const re =
		/^>\s*\*\*~?[-+0-9.]+%\*\*\s+performance improvement on average\.?$/m;
	const newLine = `> **~${avgPct.toFixed(precision)}%** performance improvement on average.`;
	if (re.test(sectionText)) return sectionText.replace(re, newLine);
	return sectionText;
}

function buildIterationsLine(pair, it, wm) {
	const leftIter = pair.left.iterations != null ? pair.left.iterations : it;
	const rightIter = pair.right.iterations != null ? pair.right.iterations : it;
	if (leftIter === rightIter) {
		return `_${it} ${pair.runsLabel} (${wm} warmup)_`;
	}
	return `_${rightIter} ${pair.runsLabel} (${wm} warmup) for blazediff; ${leftIter} ${pair.runsLabel} (${wm} warmup) for ${pair.left.name}_`;
}

/**
 * Resolve the list of variants for a pair. Multi-variant pairs declare
 * `pair.variants` explicitly. Legacy pairs synthesize a single variant from
 * `pair.section` plus optional per-side `taskPrefix` filters.
 */
function resolveVariants(pair) {
	if (Array.isArray(pair.variants) && pair.variants.length > 0) {
		return pair.variants.map((v) => ({
			section: v.section,
			leftTaskPrefix: v.leftTaskPrefix,
			rightTaskPrefix: v.rightTaskPrefix,
		}));
	}
	return [
		{
			section: pair.section,
			leftTaskPrefix: pair.left.taskPrefix,
			rightTaskPrefix: pair.right.taskPrefix,
		},
	];
}

/**
 * Ordered series for a variant: baseline (`left`) first, then `right`, then any
 * `extra` sides. Extra sides only apply to non-multi-variant pairs and resolve
 * their JSON from the pair definition (`<dir>/<filename>` under the repo root).
 */
function variantSeries(pair, variant, leftPath, rightPath) {
	const list = [
		{ name: pair.left.name, path: leftPath, prefix: variant.leftTaskPrefix },
		{ name: pair.right.name, path: rightPath, prefix: variant.rightTaskPrefix },
	];
	if (!Array.isArray(pair.variants) && Array.isArray(pair.extra)) {
		for (const e of pair.extra) {
			list.push({
				name: e.name,
				path: path.join(REPO_ROOT, e.dir, e.filename),
				prefix: e.taskPrefix,
			});
		}
	}
	return list;
}

function patchVariant(md, pair, variant, leftPath, rightPath, it, wm, pr) {
	const series = variantSeries(pair, variant, leftPath, rightPath).map((s) => ({
		name: s.name,
		results: loadResults(s.path, s.prefix),
	}));
	const rows = buildRows(series, pr);
	if (!rows.length) {
		throw new Error(
			`No overlapping benchmark names for variant "${variant.section}". ` +
				`Left prefix: ${variant.leftTaskPrefix ?? "(none)"}, ` +
				`right prefix: ${variant.rightTaskPrefix ?? "(none)"}.`,
		);
	}

	let section = findSection(md, variant.section);
	if (!section) {
		// Insert after the previous variant's section if one is already
		// present (so related tables stay adjacent), otherwise append.
		let insertAt = md.length;
		let sibling = null;
		for (const other of resolveVariants(pair)) {
			if (other.section === variant.section) continue;
			const found = findSection(md, other.section);
			if (found && found.end > insertAt - md.length + 1) {
				// pick the latest existing sibling so we land just after it
				insertAt = found.end;
				sibling = found;
			}
		}
		md = insertSectionSkeleton(md, variant.section, insertAt, sibling);
		section = findSection(md, variant.section);
		if (!section)
			throw new Error(`Failed to insert section: ${variant.section}`);
	}

	let sectionText = md.slice(section.start, section.end);
	const html = buildHtmlTable(
		rows,
		series.map((s) => s.name),
	);
	const avgPct = averagePct(rows);
	const iterationsLine = buildIterationsLine(pair, it, wm);

	sectionText = replaceTable(sectionText, html);
	sectionText = replaceIterationsLine(sectionText, iterationsLine);
	sectionText = replaceAvgPctBlockquote(sectionText, avgPct);

	md = md.slice(0, section.start) + sectionText + md.slice(section.end);
	return { md, rows: rows.length, avgPct, iterationsLine };
}

function update({
	pairKey,
	leftPath,
	rightPath,
	iterations,
	warmup,
	precision,
	mdPath,
}) {
	const pair = PAIRS[pairKey];
	if (!pair)
		throw new Error(
			`Unknown pair: ${pairKey}. Known: ${Object.keys(PAIRS).join(", ")}`,
		);

	const it = iterations != null ? iterations : pair.iterations;
	const wm = warmup != null ? warmup : pair.warmup;
	const pr = precision != null ? precision : pair.precision;

	let md = fs.readFileSync(mdPath, "utf8");
	const variants = resolveVariants(pair);
	const reports = [];
	for (const variant of variants) {
		const result = patchVariant(
			md,
			pair,
			variant,
			leftPath,
			rightPath,
			it,
			wm,
			pr,
		);
		md = result.md;
		reports.push({
			section: variant.section,
			rows: result.rows,
			avgPct: result.avgPct,
			iterationsLine: result.iterationsLine,
		});
	}

	fs.writeFileSync(mdPath, md);
	// Back-compat: callers that destructure `{rows, avgPct, iterationsLine}`
	// from a single-variant pair still work.
	return {
		variants: reports,
		rows: reports[0].rows,
		avgPct: reports[0].avgPct,
		iterationsLine: reports[0].iterationsLine,
	};
}

function main() {
	const args = parseArgs(process.argv);
	if (!args.pair) {
		console.error("Required: --pair <key>");
		console.error(`Known pairs: ${Object.keys(PAIRS).join(", ")}`);
		process.exit(2);
	}
	const repoRoot = path.resolve(__dirname, "../..");
	const resolveArg = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
	const pair = PAIRS[args.pair];
	const defaultMd = pair?.targetFile ? pair.targetFile : "BENCHMARKS.md";
	const mdPath = args.md ? resolveArg(args.md) : path.join(repoRoot, defaultMd);
	const result = update({
		pairKey: args.pair,
		leftPath: resolveArg(args.left),
		rightPath: resolveArg(args.right),
		iterations: args.iterations != null ? Number(args.iterations) : null,
		warmup: args.warmup != null ? Number(args.warmup) : null,
		precision: args.precision != null ? Number(args.precision) : null,
		mdPath,
	});
	for (const r of result.variants) {
		console.log(
			`Updated section "${r.section}" — ${r.rows} rows, avg ${r.avgPct.toFixed(1)}% improvement.`,
		);
		console.log(`  Iterations line: ${r.iterationsLine}`);
	}
}

if (require.main === module) main();
module.exports = { update };
