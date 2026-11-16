#!/usr/bin/env node

// Which release artifact families actually need rebuilding.
//
// The right reference is each family's *last published release* — the git tag
// changesets made for it — not the release PR's base: by the time the
// Changesets "Version Packages" PR exists, the source changes are already
// merged into its base, and the PR's own diff is pure version churn. So for
// each family this asks: did the crate sources compiled into it change since
// the version the base branch is currently at? Version-only churn (the
// `changeset version` bumps in Cargo.toml / Cargo.lock / pyproject.toml) is
// masked out of the comparison.
//
// Families and the builds that produce them (FAMILY_BUILDS):
//   core       CLI binary + core .node + wheels   blazediff (default, napi, python)
//   ssim       ssim .node + wheels                blazediff-ssim (napi, python)
//   interpret  interpret .node + wheels           blazediff-interpret (napi, python)
//   wasm       core wasm module                   blazediff (wasm)
//   wasm_interpret
//              interpret wasm module              blazediff-interpret (wasm)
//   milo       milo .node                         blazediff-milo (napi)
//   wasm_milo  milo wasm module                   blazediff-milo (wasm)
//   codec_png  codec-png .node                    blazediff-png (napi)
//   wasm_codec_png
//              codec-png wasm module              blazediff-png (wasm)
//
// Which crates and dependencies each build compiles is not listed by hand:
// cargo-resolve.js asks `cargo tree` with that build's features and targets,
// at the release tag and now. A family changed when that resolved package set
// changed, or when a source file of a workspace crate in it changed.
//
// Family keys are shell identifiers: this script's output is `eval`'d in
// release-artifacts-check.yml and `tee`'d into $GITHUB_OUTPUT, so a hyphen
// would break the eval silently. Underscores only.
//
// Wheels are deliberately not families of their own: each of the three sets
// (blazediff / blazediff-ssim / blazediff-interpret) is built from the crate a
// family is already named after, and its filenames encode that crate's version.
// So build-artifacts.yml derives each set's gating from its family flag plus a
// wheels-for-this-version-exist check. blazediff-milo has no wheel set yet: its
// PyPI trusted publisher is still to be created.
//
// Used by release-artifacts-check.yml (which families must be fresh, and the
// `--check-bumps` guard for sources changed without a version bump),
// build-artifacts.yml (which families /build compiles) and
// restore-artifacts.js (which files to restore). Keeping them on one
// implementation is the point: a build that skips what the check requires
// would wedge the release PR red.
//
// CLI: node scripts/release/changed-artifacts.js [--check-bumps] <base-ref>
// The base ref only anchors which versions count as "published" (its
// package.json versions name the tags to diff against). Prints `core=true`
// style lines to stdout (eval-able, $GITHUB_OUTPUT-able); reasoning goes to
// stderr.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { resolveBuilds, checkoutCache } = require("./cargo-resolve.js");

const ROOT = path.resolve(__dirname, "..", "..");

const FAMILIES = [
	"core",
	"ssim",
	"interpret",
	"wasm",
	"wasm_interpret",
	"milo",
	"wasm_milo",
	"codec_png",
	"wasm_codec_png",
];

const NATIVE_TARGETS = [
	"aarch64-apple-darwin",
	"x86_64-apple-darwin",
	"aarch64-unknown-linux-gnu",
	"x86_64-unknown-linux-gnu",
	"aarch64-pc-windows-msvc",
	"x86_64-pc-windows-msvc",
].flatMap((target) => ["--target", target]);

const native = (crate, ...featureSets) =>
	featureSets.map((features) => ({
		crate,
		args: [...features, ...NATIVE_TARGETS],
	}));

const wasm = (crate) => [
	{
		crate,
		args: [
			"--no-default-features",
			"--features",
			"wasm",
			"--target",
			"wasm32-unknown-unknown",
		],
	},
];

const NAPI = ["--features", "napi"];
const PYTHON = ["--features", "python"];

/**
 * The cargo builds behind each family's artifacts, mirroring build-all.sh,
 * build-napi.sh, build-maturin.sh and each crate's build-wasm.sh.
 */
const FAMILY_BUILDS = {
	core: native("blazediff", [], NAPI, PYTHON),
	ssim: native("blazediff-ssim", NAPI, PYTHON),
	interpret: native("blazediff-interpret", NAPI, PYTHON),
	wasm: wasm("blazediff"),
	wasm_interpret: wasm("blazediff-interpret"),
	milo: native("blazediff-milo", NAPI),
	wasm_milo: wasm("blazediff-milo"),
	codec_png: native("blazediff-png", NAPI),
	wasm_codec_png: wasm("blazediff-png"),
};

/** The npm package whose changesets tag anchors each family's last release. */
const FAMILY_NPM = {
	core: "@blazediff/core-native",
	ssim: "@blazediff/ssim-native",
	interpret: "@blazediff/interpret-native",
	wasm: "@blazediff/core-wasm",
	wasm_interpret: "@blazediff/interpret-wasm",
	milo: "@blazediff/milo-native",
	wasm_milo: "@blazediff/milo-wasm",
	codec_png: "@blazediff/codec-png-native",
	wasm_codec_png: "@blazediff/codec-png-wasm",
};

const FAMILY_PACKAGE = {
	core: "packages/core-native/core-native/package.json",
	ssim: "packages/ssim-native/ssim-native/package.json",
	interpret: "packages/interpret-native/interpret-native/package.json",
	wasm: "packages/core-wasm/package.json",
	wasm_interpret: "packages/interpret-wasm/package.json",
	milo: "packages/milo-native/milo-native/package.json",
	wasm_milo: "packages/milo-wasm/package.json",
	codec_png: "packages/codec-png-native/codec-png-native/package.json",
	wasm_codec_png: "packages/codec-png-wasm/package.json",
};

/** Families whose artifact is a wasm module rather than a native binary. */
const WASM_FAMILIES = new Set([
	"wasm",
	"wasm_interpret",
	"wasm_milo",
	"wasm_codec_png",
]);

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

function tryGit(argv) {
	try {
		return git(argv, { stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return null;
	}
}

/** Mask every `version = "..."` so version-only bumps compare equal. */
function maskManifestVersions(src) {
	return src.replace(/version\s*=\s*"[^"]*"/g, 'version = "*"');
}

/**
 * Mask the workspace `members` list: adding or removing a crate changes
 * nothing about what is compiled into the others. Profiles and
 * `[workspace.dependencies]` still count.
 */
function maskWorkspaceMembers(src) {
	return src.replace(/members\s*=\s*\[[^\]]*\]/, "members = [*]");
}

function contentAt(ref, file) {
	return tryGit(["show", `${ref}:${file}`]);
}

function currentContent(file) {
	try {
		return fs.readFileSync(path.join(ROOT, file), "utf8");
	} catch {
		return null; // deleted
	}
}

/** True when the file differs from `ref` beyond version-only churn. */
function meaningfullyChanged(ref, file, mask) {
	const before = contentAt(ref, file);
	const after = currentContent(file);
	if (before === null || after === null) return true;
	return mask(before) !== mask(after);
}

/** Changed paths under crates/ since `ref`, including untracked files. */
function changedPathsSince(ref) {
	const changed = git(["diff", "--name-only", ref, "--", "crates/"])
		.split("\n")
		.filter(Boolean);
	// A freshly added, not-yet-committed source file is invisible to `git
	// diff <ref>`; on CI everything is committed, but locally it matters.
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
	return changed;
}

/**
 * Files under crates/ that are never compiled into an artifact.
 *
 * Worth naming as a group, because every false positive this script has had
 * was the same mistake: reading one of the pipeline's own *outputs* as an
 * input, so the release asked to rebuild what it had just built.
 */
function isNotABuildInput(parts, basename) {
	return (
		// Docs and licences ship in no binary.
		/\.md$/i.test(basename) ||
		/^LICENSE/i.test(basename) ||
		// Crates that never ship, fuzz harnesses, and a crate's integration
		// tests and benches with their fixtures.
		UNSHIPPED_CRATES.has(parts[1]) ||
		parts.includes("fuzz") ||
		parts[2] === "tests" ||
		parts[2] === "benches" ||
		// crates.io publish recipe (publish-rust.js); runs `cargo publish`,
		// never produces a .node, wasm module or wheel.
		basename === "Dockerfile.publish" ||
		// Committed wheels. /build regenerates them, maturin's zip is not
		// byte-reproducible, and the new bytes would read as a source change
		// demanding another bump — which rebuilds them again. Their freshness
		// is require_wheels()' job in release-artifacts-check.yml, by filename
		// version.
		parts[2] === "wheels"
	);
}

/**
 * Did anything compiled into `family`'s artifacts change between `ref` and the
 * working tree? Returns a reason string, or null.
 *
 * Only build *inputs* count. Version bumps and the binaries, wheels and wasm
 * modules this pipeline produces are outputs, and must never feed back in.
 */
function sourcesChangedSince(ref, relevant, family) {
	for (const file of changedPathsSince(ref)) {
		const parts = file.split("/");
		const crate = parts[1];
		const basename = parts[parts.length - 1];

		if (isNotABuildInput(parts, basename)) continue;

		// build-wasm.sh produces a wasm module and nothing else, so it cannot
		// change a .node, a CLI binary or a wheel. Without this it reads as a
		// generic file of its crate and flags that crate's native families too.
		if (basename === "build-wasm.sh") {
			if (!WASM_FAMILIES.has(family)) continue;
			if (isCrate(ref, crate) && !relevant.has(crate)) continue;
			return `${file} changed`;
		}

		if (isCrate(ref, crate)) {
			if (!relevant.has(crate)) continue;
			// Version-only churn from `changeset version`:
			// the npm shadow package,
			if (parts.length === 3 && basename === "package.json") continue;
			// and the version lines of the crate manifests.
			if (basename === "Cargo.toml" || basename === "pyproject.toml") {
				if (meaningfullyChanged(ref, file, maskManifestVersions)) {
					return `${file} changed beyond versions`;
				}
				continue;
			}
			return `${file} changed`;
		}

		if (file === "crates/Cargo.toml") {
			if (meaningfullyChanged(ref, file, maskWorkspaceMembers)) {
				return `${file} changed beyond members`;
			}
			continue;
		}

		// Every lockfile edit that reaches this family shows up in its resolved
		// package set, which familyChangedSince() compares first.
		if (file === "crates/Cargo.lock") continue;

		// Workspace manifest, shared build scripts, Cross.toml, anything not
		// attributed above: assume it can affect every artifact.
		return `${file} changed`;
	}
	return null;
}

function isCrate(ref, dir) {
	const manifest = `crates/${dir}/Cargo.toml`;
	return (
		fs.existsSync(path.join(ROOT, manifest)) ||
		contentAt(ref, manifest) !== null
	);
}

const checkoutAt = checkoutCache(git);

function describeDrift(before, after) {
	const name = (key) => key.split("|")[0];
	const added = [...after].filter((key) => !before.has(key));
	const removed = [...before].filter((key) => !after.has(key));
	const drift = [
		...added.map((key) => `+${name(key)}`),
		...removed.map((key) => `-${name(key)}`),
	];
	const rest = drift.length > 3 ? `, +${drift.length - 3} more` : "";
	return drift.length === 0 ? null : `${drift.slice(0, 3).join(", ")}${rest}`;
}

/**
 * Did anything `family`'s builds compile change since `ref`? Returns a reason
 * string, or null. Unresolvable on either side reads as changed.
 */
function familyChangedSince(ref, family) {
	const builds = FAMILY_BUILDS[family];
	let releaseDir;
	try {
		releaseDir = checkoutAt(ref);
	} catch (error) {
		return `could not check out ${ref} (${error.message})`;
	}
	const before = resolveBuilds(releaseDir, builds);
	if (before.error) return `${before.error} at the release`;
	const after = resolveBuilds(path.join(ROOT, "crates"), builds);
	if (after.error) return after.error;

	const drift = describeDrift(before.packages, after.packages);
	if (drift !== null) return `resolved dependencies changed (${drift})`;

	const relevant = new Set([...before.members, ...after.members]);
	return sourcesChangedSince(ref, relevant, family);
}

function versionAt(ref, file) {
	const content = contentAt(ref, file);
	if (content === null) return null;
	try {
		return JSON.parse(content).version ?? null;
	} catch {
		return null;
	}
}

function versionNow(file) {
	const content = currentContent(file);
	if (content === null) return null;
	try {
		return JSON.parse(content).version ?? null;
	} catch {
		return null;
	}
}

/**
 * Per family: the tag of the version the base branch is at, i.e. the last
 * published release to compare sources against. Missing data degrades to
 * null, which callers treat as "assume changed".
 */
function lastReleaseRef(family, mergeBase) {
	const version = versionAt(mergeBase, FAMILY_PACKAGE[family]);
	if (version === null) return { ref: null, tag: null };
	const tag = `${FAMILY_NPM[family]}@${version}`;
	const ref = tryGit(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
	return { ref: ref ? ref.trim() : null, tag };
}

function resolveMergeBase(baseRef) {
	const mergeBase = tryGit(["merge-base", baseRef, "HEAD"]);
	return mergeBase ? mergeBase.trim() : baseRef;
}

/**
 * Families whose compiled sources changed since their last published
 * release. `baseRef` anchors which versions count as published. Returns
 * `{ families: {core, ssim, interpret, wasm, ...}, reasons: [..] }`.
 */
function changedFamilies(baseRef) {
	const mergeBase = resolveMergeBase(baseRef);
	const families = {};
	const reasons = [];

	for (const family of FAMILIES) {
		const { ref, tag } = lastReleaseRef(family, mergeBase);
		if (ref === null) {
			families[family] = true;
			reasons.push(
				`${family}: release tag ${tag ?? "?"} not found — assuming changed`,
			);
			continue;
		}
		const reason = familyChangedSince(ref, family);
		families[family] = reason !== null;
		reasons.push(
			reason === null
				? `${family}: sources unchanged since ${tag}`
				: `${family}: ${reason} since ${tag}`,
		);
	}

	return { families, reasons };
}

/**
 * Sources changed since the last release but the version didn't bump: with
 * per-family version groups there is no all-bump safety net, so a crate edit
 * without a changeset would silently ship stale packages. Returns the
 * offending packages.
 */
function missingBumps(baseRef) {
	const mergeBase = resolveMergeBase(baseRef);
	const offenders = [];
	for (const family of FAMILIES) {
		const { ref, tag } = lastReleaseRef(family, mergeBase);
		if (ref === null) continue; // nothing released yet to be stale against
		const reason = familyChangedSince(ref, family);
		if (reason === null) continue;
		const before = versionAt(mergeBase, FAMILY_PACKAGE[family]);
		const after = versionNow(FAMILY_PACKAGE[family]);
		if (before !== null && after !== null && before === after) {
			offenders.push(
				`${FAMILY_PACKAGE[family]} — ${reason} since ${tag}, but the version is still ${after}`,
			);
		}
	}
	return offenders;
}

module.exports = { changedFamilies, missingBumps, FAMILIES };

if (require.main === module) {
	const argv = process.argv.slice(2);
	const checkBumps = argv.includes("--check-bumps");
	const baseRef = argv.find((arg) => !arg.startsWith("-"));
	if (!baseRef) {
		console.error("usage: changed-artifacts.js [--check-bumps] <base-ref>");
		process.exit(2);
	}
	if (checkBumps) {
		const offenders = missingBumps(baseRef);
		if (offenders.length > 0) {
			console.error(
				"Sources changed since the last release but these packages did not\n" +
					"bump — a changeset naming them (or their version group) is missing:",
			);
			for (const offender of offenders) console.error(`  - ${offender}`);
			process.exit(1);
		}
		console.error("every family with source changes has a version bump");
		process.exit(0);
	}
	const { families, reasons } = changedFamilies(baseRef);
	for (const reason of reasons) console.error(`  ${reason}`);
	for (const family of FAMILIES) {
		console.log(`${family}=${families[family]}`);
	}
}
