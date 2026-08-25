#!/usr/bin/env node

// Idempotent PyPI publish step - mirrors scripts/release/publish-rust.js for crates.io.
//
// Source of truth: wheels committed at crates/<crate>/wheels/. After building
// locally with `pnpm build:python:all` (and its :ssim / :interpret siblings),
// those wheels live in the repo and CI reads them directly when
// publish-pypi.yml runs. There's no GH-Release-as-transport step anymore - the
// repo *is* the artifact store.
//
// Per package:
//   - Read version from that package's changesets shadow package.json
//   - PyPI already has it → skip
//   - Wheels in crates/<crate>/wheels/ don't match version → skip with hint
//   - Wheels uncommitted/unpushed → fail (the workflow only sees committed state)
//   - Otherwise → trigger publish-pypi.yml via workflow_dispatch
//
// Wired into `pnpm run release` so a Changesets-driven release picks up every
// package whose wheels are present in the repo for its new version.

const { execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const WORKFLOW = "publish-pypi.yml";

// PEP 427 escapes the distribution name in the wheel filename; here that only
// means hyphens become underscores.
const pypiPackage = (dist, crateDir) => ({
	dist,
	crateDir,
	// Version source of truth: the crate's private changesets shadow.
	// sync-pyproject-version.js mirrors it into pyproject.toml, which maturin
	// bakes into the wheel filenames matched below.
	shadow: path.join(ROOT, "crates", crateDir, "package.json"),
	wheelsDir: path.join(ROOT, "crates", crateDir, "wheels"),
	wheelPrefix: dist.replace(/-/g, "_"),
});

const PACKAGES = [
	pypiPackage("blazediff", "blazediff"),
	pypiPackage("blazediff-ssim", "blazediff-ssim"),
	pypiPackage("blazediff-interpret", "blazediff-interpret"),
];

const EXPECTED_PLATFORM_TAGS = [
	"macosx_11_0_arm64",
	"macosx_10_12_x86_64",
	"manylinux_2_17_aarch64",
	"manylinux_2_17_x86_64",
	"win_amd64",
	"win_arm64",
];

function readShadowVersion(shadowPath) {
	const { version } = JSON.parse(fs.readFileSync(shadowPath, "utf8"));
	if (!version) throw new Error(`No version field in ${shadowPath}`);
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

function listWheels(wheelsDir, prefix, version) {
	if (!fs.existsSync(wheelsDir)) return [];
	return fs
		.readdirSync(wheelsDir)
		.filter((f) => f.endsWith(".whl"))
		.filter((f) => f.startsWith(`${prefix}-${version}-`))
		.map((f) => path.join(wheelsDir, f));
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

function gitStatusForWheels(wheelsDir) {
	// Returns array of porcelain status entries touching the wheels dir.
	const relative = path.relative(ROOT, wheelsDir);
	const r = spawnSync("git", ["status", "--porcelain", "--", relative], {
		cwd: ROOT,
		encoding: "utf8",
	});
	if (r.status !== 0) return [];
	return r.stdout.split("\n").filter(Boolean);
}

/** @returns true when the package was dispatched, false when skipped. */
async function publish(pkg) {
	const { dist, crateDir, shadow, wheelsDir, wheelPrefix } = pkg;
	const version = readShadowVersion(shadow);
	const relativeWheels = path.relative(ROOT, wheelsDir);

	console.log(`\n--- Publishing ${dist} to PyPI ---`);
	console.log(`crates/${crateDir} shadow version: ${version}`);

	if (await versionExistsOnPyPI(dist, version)) {
		console.log(`Version ${version} already on PyPI, skipping.`);
		return false;
	}
	console.log(`${dist}@${version} not on PyPI yet.`);

	const wheels = listWheels(wheelsDir, wheelPrefix, version);
	if (wheels.length === 0) {
		console.log(
			`No wheels for ${version} in ${relativeWheels}/. Skipping PyPI publish.`,
		);
		console.log(
			`To publish: build this package's wheels (which syncs to ${relativeWheels}/), commit, then re-run.`,
		);
		return false;
	}

	const missing = missingPlatformTags(wheels);
	if (missing.length > 0) {
		console.log(`Warning: missing wheels for platforms: ${missing.join(", ")}`);
		if (!process.env.PYPI_PUBLISH_PARTIAL) {
			console.log(
				`Aborting. Set PYPI_PUBLISH_PARTIAL=1 to publish anyway, or rebuild the full set.`,
			);
			process.exit(1);
		}
	}

	const dirty = gitStatusForWheels(wheelsDir);
	if (dirty.length > 0) {
		console.log(
			`\nWheels in ${relativeWheels}/ are uncommitted; the workflow only sees committed state:`,
		);
		for (const line of dirty) console.log(`  ${line}`);
		console.log(`\nCommit and push first:`);
		console.log(
			`  git add ${relativeWheels} && git commit -m "chore(release): ${dist} wheels v${version}" && git push`,
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
	console.log(`\nTriggering ${WORKFLOW} for ${dist} via workflow_dispatch...`);
	execSync(
		`gh workflow run ${WORKFLOW} -f package=${dist} -f version=${version}`,
		{ cwd: ROOT, stdio: "inherit" },
	);
	return true;
}

async function main() {
	let dispatched = 0;
	for (const pkg of PACKAGES) {
		if (await publish(pkg)) dispatched += 1;
	}

	if (dispatched === 0) {
		console.log("\nNothing to publish to PyPI.");
		return;
	}
	console.log(`\nDispatched ${dispatched} workflow run(s). Watch with:`);
	console.log(`  gh run list --workflow=${WORKFLOW} --limit=${dispatched}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
