#!/usr/bin/env node

// Which release artifact families actually need rebuilding, given a base ref.
//
// The Changesets "Version Packages" PR bumps every crate's Cargo.toml,
// package.json shadow, pyproject.toml and Cargo.lock — all in one fixed
// version group — so a naive `git diff -- crates/<dir>` reports every crate
// as changed on every native release. This script answers the question the
// release tooling actually has: did the *sources* that end up inside each
// shipped binary change, ignoring version-only churn?
//
// Families and the crate sources compiled into them:
//   core       CLI binary + core .node    blazediff, blazediff-shared, blazediff-png
//   ssim       ssim .node                 blazediff-ssim, blazediff-shared, blazediff-png
//   interpret  interpret .node            blazediff-interpret, blazediff, blazediff-ssim,
//                                         blazediff-shared, blazediff-png
//   wasm       core wasm module           blazediff, blazediff-shared (built without codecs)
//
// Wheels are deliberately not a family: their filenames encode the release
// version, so every native release needs a fresh set regardless.
//
// Used by release-artifacts-check.yml (which families must be fresh),
// build-artifacts.yml (which families /build compiles) and
// restore-artifacts.js (which files to restore). Keeping them on one
// implementation is the point: a build that skips what the check requires
// would wedge the release PR red.
//
// CLI: node scripts/release/changed-artifacts.js <base-ref>
// Prints `core=true` style lines to stdout (eval-able, $GITHUB_OUTPUT-able);
// the reasoning goes to stderr.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const FAMILIES = ["core", "ssim", "interpret", "wasm"];

/** Which families each crate's sources are compiled into. */
const CRATE_FAMILIES = {
	blazediff: ["core", "interpret", "wasm"],
	"blazediff-shared": ["core", "ssim", "interpret", "wasm"],
	// Pulled in via blazediff-shared's `codecs` feature, which the wasm build
	// turns off.
	"blazediff-png": ["core", "ssim", "interpret"],
	"blazediff-ssim": ["ssim", "interpret"],
	"blazediff-interpret": ["interpret"],
};

/** Crates under crates/ that never ship in an artifact. */
const UNSHIPPED_CRATES = new Set([
	"blazediff-interpret-verify",
	"blazediff-png-benchmark",
	"blazediff-ssim-benchmark",
]);

function git(argv, options = {}) {
	return execFileSync("git", argv, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		...options,
	});
}

/** Mask every `version = "..."` so version-only bumps compare equal. */
function maskManifestVersions(src) {
	return src.replace(/version\s*=\s*"[^"]*"/g, 'version = "*"');
}

/**
 * Mask the version lines of the workspace's own crates in Cargo.lock, and
 * nothing else — an external dependency bump (`cargo update`) must still
 * read as a source change.
 */
function maskLockVersions(src) {
	const workspaceCrates = Object.keys(CRATE_FAMILIES).join("|");
	const re = new RegExp(
		`(name = "(?:${workspaceCrates})"\\nversion = ")[^"]*(")`,
		"g",
	);
	return src.replace(re, "$1*$2");
}

function baseContent(base, file) {
	try {
		return git(["show", `${base}:${file}`], {
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null; // didn't exist at base
	}
}

function currentContent(file) {
	try {
		return fs.readFileSync(path.join(ROOT, file), "utf8");
	} catch {
		return null; // deleted since base
	}
}

/** True when the file differs beyond version-only churn. */
function meaningfullyChanged(base, file, mask) {
	const before = baseContent(base, file);
	const after = currentContent(file);
	if (before === null || after === null) return true;
	return mask(before) !== mask(after);
}

/**
 * Families whose compiled sources changed between `baseRef` and the working
 * tree. Returns `{ families: {core, ssim, interpret, wasm}, reasons: [..] }`.
 */
function changedFamilies(baseRef) {
	// The release branch may be behind the base ref's branch tip; diff from
	// the fork point so unrelated later commits on base don't read as changes.
	let base = baseRef;
	try {
		base = git(["merge-base", baseRef, "HEAD"]).trim();
	} catch {
		// baseRef may be a detached SHA with no better merge-base; use as-is.
	}

	const families = Object.fromEntries(FAMILIES.map((f) => [f, false]));
	const reasons = [];
	const markAll = (why) => {
		for (const family of FAMILIES) families[family] = true;
		reasons.push(`${why} -> all families`);
	};
	const mark = (crate, why) => {
		for (const family of CRATE_FAMILIES[crate]) families[family] = true;
		reasons.push(`${why} -> ${CRATE_FAMILIES[crate].join(", ")}`);
	};

	const changed = git(["diff", "--name-only", base, "--", "crates/"])
		.split("\n")
		.filter(Boolean);
	// A freshly added, not-yet-committed source file is invisible to `git
	// diff <base>`; on CI everything is committed, but locally it matters.
	const untracked = git([
		"ls-files",
		"--others",
		"--exclude-standard",
		"--",
		"crates/",
	])
		.split("\n")
		.filter(Boolean);
	for (const file of untracked) {
		if (!changed.includes(file)) changed.push(file);
	}

	for (const file of changed) {
		const parts = file.split("/");
		const crate = parts[1];
		const basename = parts[parts.length - 1];

		// Docs and licenses ship in no binary.
		if (/\.md$/i.test(basename) || /^LICENSE/i.test(basename)) continue;
		if (UNSHIPPED_CRATES.has(crate)) continue;
		if (parts.includes("fuzz")) continue;

		if (crate in CRATE_FAMILIES) {
			// Version-only churn from `changeset version`:
			// the npm shadow package and its changelog,
			if (parts.length === 3 && basename === "package.json") continue;
			// and the version lines of the crate manifests.
			if (basename === "Cargo.toml" || basename === "pyproject.toml") {
				if (meaningfullyChanged(base, file, maskManifestVersions)) {
					mark(crate, `${file} changed beyond versions`);
				}
				continue;
			}
			mark(crate, `${file} changed`);
			continue;
		}

		if (file === "crates/Cargo.lock") {
			if (meaningfullyChanged(base, file, maskLockVersions)) {
				markAll(`${file} changed beyond workspace crate versions`);
			}
			continue;
		}

		// Workspace manifest, shared build scripts, Cross.toml, anything not
		// attributed above: assume it can affect every artifact.
		markAll(`${file} changed`);
	}

	return { families, reasons };
}

module.exports = { changedFamilies, FAMILIES };

if (require.main === module) {
	const baseRef = process.argv[2];
	if (!baseRef) {
		console.error("usage: changed-artifacts.js <base-ref>");
		process.exit(2);
	}
	const { families, reasons } = changedFamilies(baseRef);
	for (const reason of reasons) console.error(`  ${reason}`);
	if (reasons.length === 0) {
		console.error("  no shipped crate sources changed");
	}
	for (const family of FAMILIES) {
		console.log(`${family}=${families[family]}`);
	}
}
