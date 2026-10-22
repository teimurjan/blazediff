/**
 * Benchmark artifacts: one committed `benchmarks/results/<key>.json` per bench,
 * the single source the Markdown tables and the website both render from.
 *
 * Shape (schemaVersion 1):
 *   { schemaVersion, key, category, generatedAt, commit: {sha, dirty},
 *     env: {platform, arch, osRelease, cpu, cores, memoryGb, node, rustc?, python?},
 *     config: {iterations?, warmup?, method?, ioIncluded},
 *     sections: [{ id, title, unit: "ms" | "bytes", stat: "mean" | "best" | "size", note?,
 *       series: [{id, name, version?, iterations?, baseline, ours}],
 *       rows: [{fixture, mpx?, values: {[seriesId]: {value, min?, max?} | null}}] }] }
 *
 * The series flagged `baseline` is the one the others are measured against.
 * Pair benches always list it first.
 */

const fs = require("node:fs");
const path = require("node:path");
const { seriesOf, sideJsonPath } = require("./pairs.js");
const {
	collectEnv,
	collectCommit,
	npmVersion,
	pythonVersion,
} = require("./env.js");

const REPO_ROOT = path.resolve(__dirname, "../..");
const RESULTS_DIR = path.join(REPO_ROOT, "benchmarks/results");
const SCHEMA_VERSION = 1;

const slug = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

const artifactPath = (key) => path.join(RESULTS_DIR, `${key}.json`);

function header({ key, category, config, python = false }) {
	return {
		schemaVersion: SCHEMA_VERSION,
		key,
		category,
		generatedAt: new Date().toISOString(),
		commit: collectCommit(),
		env: collectEnv({ python }),
		config,
	};
}

/**
 * Load tinybench JSON. If `prefix` is given, only return entries whose name
 * begins with `${prefix} - ` (exact prefix match). The remaining substring
 * after " - " is used as the fixture key. With no prefix, strip everything up
 * to the first " - ".
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

function sideVersion(side) {
	const dir = path.join(REPO_ROOT, side.dir);
	if (side.package) return npmVersion(side.package, dir);
	if (side.pythonPackage) return pythonVersion(side.pythonPackage, dir);
	return undefined;
}

// Multi-variant pairs stay two-sided; single-section pairs carry their extras.
function sectionSpecs(key, pair) {
	if (Array.isArray(pair.variants) && pair.variants.length > 0) {
		return pair.variants.map((v) => ({
			id: v.id,
			title: v.section,
			note: v.note,
			sides: [
				{ ...pair.left, taskPrefix: v.leftTaskPrefix },
				{ ...pair.right, taskPrefix: v.rightTaskPrefix },
			],
		}));
	}
	return [
		{ id: key, title: pair.section, note: pair.note, sides: seriesOf(pair) },
	];
}

function buildPairSection({ id, title, note, sides }, iterations) {
	const series = sides.map((side, i) => ({
		id: slug(side.name),
		name: side.name,
		version: sideVersion(side),
		iterations: side.iterations ?? iterations,
		baseline: i === 0,
		ours: i > 0,
	}));
	const latencies = sides.map(
		(side) =>
			new Map(
				loadResults(sideJsonPath(side), side.taskPrefix).map((r) => [
					r.key,
					r.latency,
				]),
			),
	);
	const fixtures = [...new Set(latencies.flatMap((m) => [...m.keys()]))].sort(
		(a, b) => a.localeCompare(b),
	);
	const rows = fixtures.map((fixture) => ({
		fixture,
		values: Object.fromEntries(
			series.map((s, i) => {
				const l = latencies[i].get(fixture);
				return [s.id, l ? { value: l.mean, min: l.min, max: l.max } : null];
			}),
		),
	}));
	return { id, title, unit: "ms", stat: "mean", note, series, rows };
}

function buildPairArtifact(key, pair, { iterations, warmup }) {
	return {
		...header({
			key,
			category: path.basename(pair.targetFile, ".md"),
			config: { iterations, warmup, ioIncluded: pair.ioIncluded },
			python: seriesOf(pair).some((side) => side.pythonPackage),
		}),
		sections: sectionSpecs(key, pair).map((spec) =>
			buildPairSection(spec, iterations),
		),
	};
}

function writeArtifact(artifact) {
	fs.mkdirSync(RESULTS_DIR, { recursive: true });
	const out = artifactPath(artifact.key);
	fs.writeFileSync(out, `${JSON.stringify(artifact, null, "\t")}\n`);
	return out;
}

function readArtifact(key) {
	const p = artifactPath(key);
	if (!fs.existsSync(p)) return null;
	return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = {
	header,
	slug,
	buildPairArtifact,
	writeArtifact,
	readArtifact,
	artifactPath,
};
