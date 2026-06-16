#!/usr/bin/env node

// Idempotent PyPI publish step - mirrors scripts/release/publish-rust.js for crates.io.
//
// Source of truth: wheels committed at crates/blazediff/wheels/. After building
// locally with `pnpm build:python:all`, those wheels live in the repo and CI
// reads them directly when publish-pypi.yml runs. There's no GH-Release-as-
// transport step anymore - the repo *is* the artifact store.
//
// Logic:
//   - Read version from the @blazediff/python changesets shadow package.json
//   - PyPI already has it → skip
//   - Wheels in crates/blazediff/wheels/ don't match version → skip with hint
//   - Wheels uncommitted/unpushed → warn (the workflow only sees committed state)
//   - Otherwise → trigger publish-pypi.yml via workflow_dispatch
//
// Wired into `pnpm run release` so a Changesets-driven release picks it up
// automatically when wheels are present in the repo for the new version.

const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
// Version source of truth: the private @blazediff/rust changesets shadow.
// sync-cargo-version.js mirrors it into pyproject.toml, which maturin bakes into
// the wheel filenames matched below.
const RUST_SHADOW = path.join(ROOT, "crates", "blazediff", "package.json");
const WHEELS_DIR = path.join(ROOT, "crates", "blazediff", "wheels");
const PACKAGE = "blazediff";
const WORKFLOW = "publish-pypi.yml";
const EXPECTED_PLATFORM_TAGS = [
	"macosx_11_0_arm64",
	"macosx_10_12_x86_64",
	"manylinux_2_17_aarch64",
	"manylinux_2_17_x86_64",
	"win_amd64",
	"win_arm64",
];

function readShadowVersion() {
	const { version } = JSON.parse(fs.readFileSync(RUST_SHADOW, "utf8"));
	if (!version) throw new Error(`No version field in ${RUST_SHADOW}`);
	return version;
}

async function versionExistsOnPyPI(name, version) {
	try {
		const res = await fetch(`https://pypi.org/pypi/${name}/${version}/json`, {
			headers: {
				"User-Agent":
					"blazediff-publish-script (https://github.com/teimurjan/blazediff)",
			},
		});
		if (res.ok) return true;
		if (res.status === 404) return false;
		console.log(
			`PyPI check returned status ${res.status}; treating as not-exists`,
		);
		return false;
	} catch (err) {
		console.log(`Failed to check PyPI: ${err.message}`);
		return false;
	}
}

function listWheels(version) {
	if (!fs.existsSync(WHEELS_DIR)) return [];
	return fs
		.readdirSync(WHEELS_DIR)
		.filter((f) => f.endsWith(".whl"))
		.filter((f) => f.includes(`-${version}-`))
		.map((f) => path.join(WHEELS_DIR, f));
}

function missingPlatformTags(wheels) {
	const present = new Set();
	for (const w of wheels) {
		for (const tag of EXPECTED_PLATFORM_TAGS) {
			if (w.includes(tag)) present.add(tag);
		}
	}
	return EXPECTED_PLATFORM_TAGS.filter((t) => !present.has(t));
}

function commandExists(cmd) {
	const r = spawnSync("command", ["-v", cmd], { shell: true });
	return r.status === 0;
}

function gitStatusForWheels() {
	// Returns array of porcelain status entries touching the wheels dir.
	const r = spawnSync(
		"git",
		["status", "--porcelain", "--", "crates/blazediff/wheels"],
		{ cwd: ROOT, encoding: "utf8" },
	);
	if (r.status !== 0) return [];
	return r.stdout.split("\n").filter(Boolean);
}

async function main() {
	const version = readShadowVersion();
	console.log(`\n--- Publishing ${PACKAGE} to PyPI ---`);
	console.log(`@blazediff/python shadow version: ${version}`);

	if (await versionExistsOnPyPI(PACKAGE, version)) {
		console.log(`Version ${version} already on PyPI, skipping.`);
		return;
	}
	console.log(`${PACKAGE}@${version} not on PyPI yet.`);

	const wheels = listWheels(version);
	if (wheels.length === 0) {
		console.log(
			`No wheels for ${version} in ${path.relative(ROOT, WHEELS_DIR)}/. Skipping PyPI publish.`,
		);
		console.log(
			`To publish: \`pnpm build:python:all\` (which syncs to wheels/), commit, then re-run.`,
		);
		return;
	}

	const missing = missingPlatformTags(wheels);
	if (missing.length > 0) {
		console.log(`Warning: missing wheels for platforms: ${missing.join(", ")}`);
		if (!process.env.PYPI_PUBLISH_PARTIAL) {
			console.log(
				`Aborting. Set PYPI_PUBLISH_PARTIAL=1 to publish anyway, or rebuild with \`pnpm build:python:all\`.`,
			);
			process.exit(1);
		}
	}

	const dirty = gitStatusForWheels();
	if (dirty.length > 0) {
		console.log(
			`\nWheels in crates/blazediff/wheels/ are uncommitted; the workflow only sees committed state:`,
		);
		for (const line of dirty) console.log(`  ${line}`);
		console.log(`\nCommit and push first:`);
		console.log(
			`  git add crates/blazediff/wheels && git commit -m "chore(release): wheels v${version}" && git push`,
		);
		console.log(`Then re-run this script.`);
		process.exit(1);
	}

	if (!commandExists("gh")) {
		console.log(
			"`gh` CLI not found. Install from https://cli.github.com/ and run `gh auth login`.",
		);
		process.exit(1);
	}

	console.log(`Found ${wheels.length} committed wheel(s) for ${version}.`);
	console.log(`\nTriggering ${WORKFLOW} via workflow_dispatch...`);
	execSync(`gh workflow run ${WORKFLOW} -f version=${version}`, {
		cwd: ROOT,
		stdio: "inherit",
	});

	console.log(`\nWorkflow dispatched. Watch with:`);
	console.log(
		`  gh run watch $(gh run list --workflow=${WORKFLOW} --limit=1 --json databaseId -q '.[0].databaseId')`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
