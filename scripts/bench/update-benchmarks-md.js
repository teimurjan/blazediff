#!/usr/bin/env node
/**
 * Patch the table, iterations line, and average-improvement blockquote of one
 * Markdown section per artifact section. The numbers come from the bench's
 * artifact (`benchmarks/results/<key>.json`), so the md never disagrees with
 * the website.
 *
 * Usage:
 *   node update-benchmarks-md.js --pair core [--md benchmarks/pixel-by-pixel.md]
 */

const fs = require("node:fs");
const path = require("node:path");
const { PAIRS } = require("./pairs.js");
const { readArtifact, artifactPath } = require("./artifact.js");

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
 * One row per fixture that every series measured. `series[0]` is the
 * baseline; every other series contributes a formatted latency plus a
 * saved/% pair measured against the baseline.
 */
function buildRows(section, precision) {
	const [baseline, ...others] = section.series;
	const rows = [];
	for (const row of section.rows) {
		const base = row.values[baseline.id];
		const matches = others.map((s) => row.values[s.id]);
		if (!base || matches.some((m) => !m)) continue;
		const a = base.value;
		const cells = [`${a.toFixed(precision)}ms`];
		const comps = [];
		for (const m of matches) {
			const b = m.value;
			const saved = a - b;
			const pct = a ? (saved / a) * 100 : 0;
			cells.push(`${b.toFixed(precision)}ms`);
			comps.push({
				saved: `${saved.toFixed(precision)}ms`,
				pct: `${pct.toFixed(1)}%`,
				pctNum: pct,
			});
		}
		rows.push({ key: row.fixture, cells, comps });
	}
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

function buildIterationsLine(pair, section, config) {
	const [left, right] = section.series;
	const wm = config.warmup;
	if (left.iterations === right.iterations) {
		return `_${config.iterations} ${pair.runsLabel} (${wm} warmup)_`;
	}
	return `_${right.iterations} ${pair.runsLabel} (${wm} warmup) for blazediff; ${left.iterations} ${pair.runsLabel} (${wm} warmup) for ${left.name}_`;
}

function patchSection(md, pair, artifact, section) {
	const rows = buildRows(section, pair.precision);
	if (!rows.length) {
		throw new Error(
			`No fixture measured by every series in "${section.title}" (${section.series.map((s) => s.name).join(", ")}).`,
		);
	}

	let found = findSection(md, section.title);
	if (!found) {
		// Insert after the last sibling section already present (so related
		// tables stay adjacent), otherwise append.
		let insertAt = md.length;
		let sibling = null;
		for (const other of artifact.sections) {
			if (other.id === section.id) continue;
			const candidate = findSection(md, other.title);
			if (candidate && (!sibling || candidate.end > sibling.end)) {
				insertAt = candidate.end;
				sibling = candidate;
			}
		}
		md = insertSectionSkeleton(md, section.title, insertAt, sibling);
		found = findSection(md, section.title);
		if (!found) throw new Error(`Failed to insert section: ${section.title}`);
	}

	const html = buildHtmlTable(
		rows,
		section.series.map((s) => s.name),
	);
	const avgPct = averagePct(rows);
	const iterationsLine = buildIterationsLine(pair, section, artifact.config);

	let sectionText = md.slice(found.start, found.end);
	sectionText = replaceTable(sectionText, html);
	sectionText = replaceIterationsLine(sectionText, iterationsLine);
	sectionText = replaceAvgPctBlockquote(sectionText, avgPct);

	md = md.slice(0, found.start) + sectionText + md.slice(found.end);
	return { md, rows: rows.length, avgPct, iterationsLine };
}

function update({ pair, artifact, mdPath }) {
	let md = fs.readFileSync(mdPath, "utf8");
	const reports = [];
	for (const section of artifact.sections) {
		const result = patchSection(md, pair, artifact, section);
		md = result.md;
		reports.push({
			section: section.title,
			rows: result.rows,
			avgPct: result.avgPct,
			iterationsLine: result.iterationsLine,
		});
	}
	fs.writeFileSync(mdPath, md);
	return reports;
}

function main() {
	const args = parseArgs(process.argv);
	const pair = PAIRS[args.pair];
	if (!pair) {
		console.error("Required: --pair <key>");
		console.error(`Known pairs: ${Object.keys(PAIRS).join(", ")}`);
		process.exit(2);
	}
	const artifact = readArtifact(args.pair);
	if (!artifact) {
		console.error(`Missing artifact: ${artifactPath(args.pair)}`);
		process.exit(1);
	}
	const mdPath = path.resolve(REPO_ROOT, args.md ?? pair.targetFile);
	for (const r of update({ pair, artifact, mdPath })) {
		console.log(
			`Updated section "${r.section}" — ${r.rows} rows, avg ${r.avgPct.toFixed(1)}% improvement.`,
		);
		console.log(`  Iterations line: ${r.iterationsLine}`);
	}
}

if (require.main === module) main();
module.exports = { update };
