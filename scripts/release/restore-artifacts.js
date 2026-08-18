#!/usr/bin/env node

// Put release binaries back into the working tree from a previous
// `build-artifacts` run, instead of rebuilding them.
//
// The binaries live in the Changesets "Version Packages" PR, and that branch is
// force-pushed from scratch every time main moves — which throws away the
// `build: artifacts for vX.Y.Z` commit that `/build` made. Rebuilding costs ~90
// minutes of runner time to reproduce bytes that already exist, so this pulls
// them from the run that already built them.
//
// Selective, like `/build` itself: scripts/release/changed-artifacts.js
// decides which artifact families (core / ssim / interpret / wasm) the
// current tree actually needs refreshed — version-only bumps don't count —
// and only those files are restored. Wheels are always restored. `--all`
// restores everything the run built regardless.
//
// Usage:
//   node scripts/release/restore-artifacts.js 6.0.0
//   node scripts/release/restore-artifacts.js            # version from Cargo.toml
//   node scripts/release/restore-artifacts.js 6.0.0 --run 32029701621
//   node scripts/release/restore-artifacts.js --list
//   node scripts/release/restore-artifacts.js --all      # skip family filtering
//   node scripts/release/restore-artifacts.js --base origin/main
//
// Nothing is committed: the files land in the working tree and the commit is
// yours to make. `scripts/checks/check-no-binaries.sh` will reject it, which is
// correct for a hand-built binary and wrong for this one — commit with
// `git commit --no-verify`.
//
// GitHub keeps these artifacts for `retention-days` (see build-artifacts.yml)
// and then deletes them for good. Past that window there is no shortcut left
// and `/build` is the only way back.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { changedFamilies, FAMILIES } = require("./changed-artifacts.js");

const ROOT = path.resolve(__dirname, "..", "..");
const WORKFLOW = "build-artifacts.yml";

// The build matrix in build-artifacts.yml. A run missing any of these built
// only part of the platform set — restoring from it would mix versions across
// platforms. (The wasm artifact is optional: a run skips it when the wasm
// sources didn't change.)
const TARGETS = [
	"aarch64-apple-darwin",
	"x86_64-apple-darwin",
	"aarch64-unknown-linux-gnu",
	"x86_64-unknown-linux-gnu",
	"aarch64-pc-windows-msvc",
	"x86_64-pc-windows-msvc",
];
const WASM_ARTIFACT = "wasm";
const WHEELS_DIR = path.join("crates", "blazediff", "wheels");

// How many recent runs to probe before giving up, when no --run is given.
const MAX_RUNS_PROBED = 5;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIST = args.includes("--list");
const ALL = args.includes("--all");
const RUN_ID = args.includes("--run") ? args[args.indexOf("--run") + 1] : null;
const BASE_REF = args.includes("--base")
	? args[args.indexOf("--base") + 1]
	: "origin/main";
const requestedVersion = args.find(
	(arg) => !arg.startsWith("-") && arg !== RUN_ID && arg !== BASE_REF,
);

/** Which family a restored path belongs to, or "wheels" (always wanted). */
function familyOf(relative) {
	if (relative.startsWith("packages/core-native-")) return "core";
	if (relative.startsWith("packages/ssim-native-")) return "ssim";
	if (relative.startsWith("packages/interpret-native-")) return "interpret";
	if (relative.startsWith(path.join("packages", "core-wasm"))) return "wasm";
	if (relative.startsWith(WHEELS_DIR)) return "wheels";
	return null;
}

/** The families this working tree needs refreshed, per changed-artifacts.js. */
function neededFamilies() {
	if (ALL) {
		return Object.fromEntries(FAMILIES.map((family) => [family, true]));
	}
	const { families, reasons } = changedFamilies(BASE_REF);
	console.log(`Families changed since ${BASE_REF}:`);
	for (const family of FAMILIES) {
		console.log(`  ${family}=${families[family]}`);
	}
	if (reasons.length === 0) {
		console.log(
			"  (no shipped crate sources changed — only wheels will be restored;\n" +
				"   pass --all to restore every family the run built)",
		);
	}
	return families;
}

function gh(argv) {
	return execFileSync("gh", argv, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});
}

/** `owner/repo`, so the script works from a fork or a renamed remote. */
function repoSlug() {
	const { repository } = JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
	);
	const url = typeof repository === "string" ? repository : repository?.url;
	const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(url ?? "");
	if (!match) {
		throw new Error(`Could not read a GitHub repo from package.json: ${url}`);
	}
	return match[1];
}

/** The version the working tree is currently cut at. */
function repoVersion() {
	const manifest = fs.readFileSync(
		path.join(ROOT, "crates", "blazediff", "Cargo.toml"),
		"utf8",
	);
	const match = /^version\s*=\s*"([^"]+)"/m.exec(manifest);
	if (!match)
		throw new Error("could not read version from blazediff/Cargo.toml");
	return match[1];
}

function successfulRuns(slug) {
	const runs = JSON.parse(
		gh([
			"run",
			"list",
			"--workflow",
			WORKFLOW,
			"--status",
			"success",
			"--limit",
			String(MAX_RUNS_PROBED),
			"--repo",
			slug,
			"--json",
			"databaseId,createdAt,url",
		]),
	);
	return runs.map((run) => ({ ...run, id: String(run.databaseId) }));
}

/**
 * Artifacts for a run, or null when the set is incomplete or already expired.
 *
 * Expiry is the common case rather than an edge one: retention is short, so a
 * run from last week lists its artifacts with `expired: true` and no download.
 */
function usableArtifacts(slug, runId) {
	const { artifacts } = JSON.parse(
		gh(["api", `repos/${slug}/actions/runs/${runId}/artifacts`, "--paginate"]),
	);
	const live = artifacts.filter((artifact) => !artifact.expired);
	const names = new Set(live.map((artifact) => artifact.name));

	const missing = TARGETS.map((target) => `target-${target}`).filter(
		(name) => !names.has(name),
	);

	if (missing.length > 0) {
		const expired = artifacts.some((artifact) => artifact.expired);
		return { ok: false, missing, expired };
	}
	return { ok: true, artifacts: live, hasWasm: names.has(WASM_ARTIFACT) };
}

function download(slug, runId, dir, name = null) {
	const argv = ["run", "download", runId, "--repo", slug, "-D", dir];
	if (name) argv.push("-n", name);
	execFileSync("gh", argv, { stdio: ["ignore", "pipe", "pipe"] });
}

/** The version a downloaded target artifact was built at, read off its wheel. */
function versionOf(targetDir) {
	const wheelDir = path.join(targetDir, WHEELS_DIR);
	if (!fs.existsSync(wheelDir)) return null;
	const wheel = fs.readdirSync(wheelDir).find((file) => file.endsWith(".whl"));
	if (!wheel) return null;
	// blazediff-6.0.0-cp38-abi3-macosx_11_0_arm64.whl
	return /^blazediff-([^-]+)-/.exec(wheel)?.[1] ?? null;
}

/** Every file in `dir`, as paths relative to it. */
function walk(dir, base = dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)];
	});
}

/**
 * Copy the downloaded tree into the repo.
 *
 * `target-*` archives are rooted at the repo root, so they map across
 * one-to-one. The `wasm` archive is rooted at the wasm directory itself,
 * matching how the commit job unpacks them.
 */
function applyArtifacts(stagingDir, needed) {
	const restored = [];
	const skipped = [];

	const apply = (source, relative, destRelative = relative) => {
		const family = familyOf(destRelative);
		if (family !== "wheels" && !(family && needed[family])) {
			skipped.push(destRelative);
			return;
		}
		const dest = path.join(ROOT, destRelative);
		if (!DRY_RUN) {
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.copyFileSync(source, dest);
		}
		restored.push(destRelative);
	};

	for (const target of TARGETS) {
		const dir = path.join(stagingDir, `target-${target}`);
		for (const relative of walk(dir)) {
			apply(path.join(dir, relative), relative);
		}
	}

	const wasmSource = path.join(stagingDir, WASM_ARTIFACT);
	const wasmDest = path.join("packages", "core-wasm", "wasm");
	if (fs.existsSync(wasmSource)) {
		for (const relative of walk(wasmSource)) {
			apply(
				path.join(wasmSource, relative),
				relative,
				path.join(wasmDest, relative),
			);
		}
	}

	return { restored, skipped };
}

/**
 * Zip archives carry no permissions, so the CLI binaries arrive non-executable.
 * Git already records which paths are 755; trust that rather than guessing.
 */
function restoreExecutableBits() {
	if (DRY_RUN) return;
	const listed = execFileSync(
		"git",
		["ls-files", "-s", "packages", WHEELS_DIR],
		{ cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
	);
	for (const line of listed.split("\n")) {
		const [meta, file] = line.split("\t");
		if (meta?.startsWith("100755") && file) {
			const full = path.join(ROOT, file);
			if (fs.existsSync(full)) fs.chmodSync(full, 0o755);
		}
	}
}

/** Nothing restored should be empty or an unsmudged LFS pointer. */
function verify(restored) {
	if (DRY_RUN) return;
	const bad = [];
	for (const relative of restored) {
		const full = path.join(ROOT, relative);
		const { size } = fs.statSync(full);
		if (size === 0) {
			bad.push(`${relative} — empty`);
			continue;
		}
		const head = fs.readFileSync(full).subarray(0, 40).toString("utf8");
		if (head.includes("git-lfs"))
			bad.push(`${relative} — still an LFS pointer`);
	}
	if (bad.length > 0) {
		throw new Error(`restored files look wrong:\n  ${bad.join("\n  ")}`);
	}
}

function listRuns(slug) {
	console.log(`Recent successful ${WORKFLOW} runs:\n`);
	for (const run of successfulRuns(slug)) {
		const state = usableArtifacts(slug, run.id);
		const status = state.ok
			? `artifacts available${state.hasWasm ? "" : " (no wasm)"}`
			: state.expired
				? "artifacts expired"
				: `incomplete (missing ${state.missing.join(", ")})`;
		console.log(`  ${run.id}  ${run.createdAt}  ${status}`);
		console.log(`      ${run.url}`);
	}
}

function main() {
	const slug = repoSlug();

	if (LIST) {
		listRuns(slug);
		return;
	}

	const version = requestedVersion ?? repoVersion();
	console.log(`Restoring v${version} artifacts into ${ROOT}`);
	if (DRY_RUN) console.log("(dry run — no files will be written)\n");

	const needed = neededFamilies();

	const runs = RUN_ID
		? [{ id: RUN_ID, createdAt: "(explicit --run)", url: "" }]
		: successfulRuns(slug);
	if (runs.length === 0) {
		throw new Error(`no successful ${WORKFLOW} runs found`);
	}

	const staging = fs.mkdtempSync(path.join(os.tmpdir(), "blazediff-restore-"));
	try {
		let chosen = null;
		const rejected = [];

		for (const run of runs) {
			const state = usableArtifacts(slug, run.id);
			if (!state.ok) {
				rejected.push(
					`  run ${run.id} — ${state.expired ? "artifacts expired" : `missing ${state.missing.join(", ")}`}`,
				);
				continue;
			}
			if (needed.wasm && !state.hasWasm) {
				rejected.push(
					`  run ${run.id} — has no wasm artifact, but the wasm sources changed`,
				);
				continue;
			}

			// Probe one target before pulling the whole set: the wheel inside it
			// names the version, and a mismatch means this run built something
			// else entirely. A single-artifact download unpacks straight into
			// -D, with no directory named after the artifact — unlike the
			// download-everything call below, which does create one per artifact.
			const probeDir = path.join(staging, "probe", run.id);
			download(slug, run.id, probeDir, `target-${TARGETS[0]}`);
			const built = versionOf(probeDir);

			if (built !== version) {
				rejected.push(
					`  run ${run.id} — built v${built ?? "?"}, not v${version}`,
				);
				continue;
			}

			chosen = run;
			break;
		}

		if (!chosen) {
			throw new Error(
				`no run has usable v${version} artifacts:\n${rejected.join("\n")}\n\n` +
					`       ${WORKFLOW} keeps artifacts for a limited window; past it,\n` +
					"       comment /build on the PR to rebuild them.",
			);
		}

		console.log(`Using run ${chosen.id} (${chosen.createdAt})`);
		if (chosen.url) console.log(`  ${chosen.url}\n`);

		const artifactsDir = path.join(staging, "full");
		download(slug, chosen.id, artifactsDir);

		// Wheels are a single-version set, so last release's have to go before
		// this one's land — same reasoning as the commit job.
		const wheelDir = path.join(ROOT, WHEELS_DIR);
		if (!DRY_RUN && fs.existsSync(wheelDir)) {
			for (const file of fs.readdirSync(wheelDir)) {
				if (file.endsWith(".whl")) fs.rmSync(path.join(wheelDir, file));
			}
		}

		const { restored, skipped } = applyArtifacts(artifactsDir, needed);
		restoreExecutableBits();
		verify(restored);

		// Every family this tree needs must actually have come out of the run:
		// a run built for a different change set may have skipped it.
		const covered = new Set(restored.map(familyOf));
		const uncovered = FAMILIES.filter(
			(family) => needed[family] && !covered.has(family),
		);
		if (uncovered.length > 0) {
			throw new Error(
				`run ${chosen.id} built nothing for: ${uncovered.join(", ")}.\n` +
					"       It ran against a different change set; comment /build on the\n" +
					"       PR to build the families this release actually needs.",
			);
		}

		console.log(`Restored ${restored.length} files:\n`);
		for (const relative of restored.sort()) console.log(`  ${relative}`);
		if (skipped.length > 0) {
			console.log(
				`\nSkipped ${skipped.length} files for unchanged families (use --all to restore them).`,
			);
		}
		console.log(
			DRY_RUN
				? "\n(dry run — nothing was written)"
				: "\nNothing is committed. To commit these:\n" +
						"  git add -A packages crates/blazediff/wheels\n" +
						"  git commit --no-verify -m 'build: artifacts for v" +
						version +
						"'\n" +
						"(--no-verify: the pre-commit hook rejects binaries, which is the\n" +
						" right default for hand-built ones and wrong for these.)",
		);
	} finally {
		fs.rmSync(staging, { recursive: true, force: true });
	}
}

try {
	main();
} catch (error) {
	console.error(`\nerror: ${error.message}`);
	process.exit(1);
}
