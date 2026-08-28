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
// Families and the crate sources compiled into them:
//   core       CLI binary + core .node    blazediff, blazediff-shared, blazediff-png
//   ssim       ssim .node                 blazediff-ssim, blazediff-shared, blazediff-png
//   interpret  interpret .node            blazediff-interpret, blazediff, blazediff-ssim,
//                                         blazediff-shared, blazediff-png
//   wasm       core wasm module           blazediff, blazediff-shared (built without codecs)
//   wasm_interpret
//              interpret wasm module      blazediff-interpret, blazediff, blazediff-ssim,
//                                         blazediff-shared (built without codecs)
//
// Family keys are shell identifiers: this script's output is `eval`'d in
// release-artifacts-check.yml and `tee`'d into $GITHUB_OUTPUT, so a hyphen
// would break the eval silently. Underscores only.
//
// Wheels are deliberately not families of their own: each of the three sets
// (blazediff / blazediff-ssim / blazediff-interpret) is built from the crate a
// family is already named after, and its filenames encode that crate's version.
// So build-artifacts.yml derives each set's gating from its family flag plus a
// wheels-for-this-version-exist check.
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

const ROOT = path.resolve(__dirname, "..", "..");

const FAMILIES = ["core", "ssim", "interpret", "wasm", "wasm_interpret"];

/** The crate sources compiled into each family's artifacts. */
const FAMILY_CRATES = {
	core: ["blazediff", "blazediff-shared", "blazediff-png"],
	ssim: ["blazediff-ssim", "blazediff-shared", "blazediff-png"],
	interpret: [
		"blazediff-interpret",
		"blazediff",
		"blazediff-ssim",
		"blazediff-shared",
		"blazediff-png",
	],
	// blazediff-shared's `codecs` feature (and blazediff-png with it) is off
	// in the wasm build.
	wasm: ["blazediff", "blazediff-shared"],
	wasm_interpret: [
		"blazediff-interpret",
		"blazediff",
		"blazediff-ssim",
		"blazediff-shared",
	],
};

/** The npm package whose changesets tag anchors each family's last release. */
const FAMILY_NPM = {
	core: "@blazediff/core-native",
	ssim: "@blazediff/ssim-native",
	interpret: "@blazediff/interpret-native",
	wasm: "@blazediff/core-wasm",
	wasm_interpret: "@blazediff/interpret-wasm",
};

const FAMILY_PACKAGE = {
	core: "packages/core-native/core-native/package.json",
	ssim: "packages/ssim-native/ssim-native/package.json",
	interpret: "packages/interpret-native/interpret-native/package.json",
	wasm: "packages/core-wasm/package.json",
	wasm_interpret: "packages/interpret-wasm/package.json",
};

const ALL_CRATES = [...new Set(Object.values(FAMILY_CRATES).flat())];

/** Families whose artifact is a wasm module rather than a native binary. */
const WASM_FAMILIES = new Set(["wasm", "wasm_interpret"]);

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
 * Mask the version lines of the workspace's own crates in Cargo.lock, and
 * nothing else — an external dependency bump (`cargo update`) must still
 * read as a source change.
 */
function maskLockVersions(src) {
	const workspaceCrates = ALL_CRATES.join("|");
	const re = new RegExp(
		`(name = "(?:${workspaceCrates})"\\nversion = ")[^"]*(")`,
		"g",
	);
	return src.replace(re, "$1*$2");
}

/**
 * Cargo.lock as `name -> { block, deps }`.
 *
 * The lockfile is one flat list of `[[package]]` stanzas, each naming the
 * packages it pulls in, which is exactly the graph needed to answer "does this
 * lockfile edit reach that family's crates?".
 */
function parseLockPackages(src) {
	const packages = new Map();
	for (const block of src.split("\n[[package]]\n").slice(1)) {
		const name = /^name = "([^"]+)"/m.exec(block)?.[1];
		if (!name) continue;
		const deps = /\ndependencies = \[\n([\s\S]*?)\n\]/.exec(block);
		packages.set(name, {
			block,
			// Entries are `"foo"` or `"foo 1.2.3 (registry+...)"`; the leading
			// token is the name either way.
			deps: deps ? [...deps[1].matchAll(/"([^"\s]+)/g)].map((m) => m[1]) : [],
		});
	}
	return packages;
}

/** Everything `roots` pull in, transitively, across both lockfile revisions. */
function dependencyClosure(graphs, roots) {
	const seen = new Set();
	const stack = [...roots];
	while (stack.length > 0) {
		const name = stack.pop();
		if (seen.has(name)) continue;
		seen.add(name);
		for (const graph of graphs) {
			for (const dep of graph.get(name)?.deps ?? []) stack.push(dep);
		}
	}
	return seen;
}

/**
 * Which of `crates`' dependencies a Cargo.lock edit actually touched.
 *
 * Without this the lockfile is attributed to every family at once, because it
 * is listed in all of their source sets: adding a wasm dep under
 * `blazediff-interpret` flagged core, ssim and core-wasm too, and
 * `--check-bumps` then demanded changesets for three packages whose binaries
 * could not have changed. Comparing per `[[package]]` stanza and walking the
 * dependency graph keeps a lockfile edit with the family it belongs to.
 */
function lockPackagesAffecting(before, after, crates) {
	const previous = parseLockPackages(maskLockVersions(before));
	const current = parseLockPackages(maskLockVersions(after));

	const changed = new Set();
	for (const [name, entry] of current) {
		if (previous.get(name)?.block !== entry.block) changed.add(name);
	}
	for (const name of previous.keys()) {
		if (!current.has(name)) changed.add(name);
	}
	if (changed.size === 0) return [];

	// Closure over both revisions so a dependency that was *removed* still
	// counts against the family that used to pull it in.
	const reachable = dependencyClosure([previous, current], crates);
	return [...changed].filter((name) => reachable.has(name));
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
		// Crates that never ship, and fuzz harnesses.
		UNSHIPPED_CRATES.has(parts[1]) ||
		parts.includes("fuzz") ||
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
function sourcesChangedSince(ref, crates, family) {
	const relevant = new Set(crates);
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
			if (ALL_CRATES.includes(crate) && !relevant.has(crate)) continue;
			return `${file} changed`;
		}

		if (ALL_CRATES.includes(crate)) {
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

		if (file === "crates/Cargo.lock") {
			const before = contentAt(ref, file);
			const after = currentContent(file);
			// Unreadable on either side: can't attribute it, so assume the worst.
			if (before === null || after === null) return `${file} changed`;
			const hits = lockPackagesAffecting(before, after, crates);
			if (hits.length > 0) {
				const named = hits.slice(0, 3).join(", ");
				const rest = hits.length > 3 ? `, +${hits.length - 3} more` : "";
				return `${file} changed for ${named}${rest}`;
			}
			continue;
		}

		// Workspace manifest, shared build scripts, Cross.toml, anything not
		// attributed above: assume it can affect every artifact.
		return `${file} changed`;
	}
	return null;
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
 * `{ families: {core, ssim, interpret, wasm}, reasons: [..] }`.
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
		const reason = sourcesChangedSince(ref, FAMILY_CRATES[family], family);
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
		const reason = sourcesChangedSince(ref, FAMILY_CRATES[family], family);
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
