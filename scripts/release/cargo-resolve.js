// What cargo actually compiles into a build: the package graph `cargo tree`
// resolves for one crate, with that build's features and targets, normal and
// build edges only. Dev-dependencies and optional dependencies the build never
// enables are not in it, which a raw Cargo.lock walk cannot tell apart.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TREE_FORMAT = "{p}|{f}";

function cargoTree(cratesDir, build) {
	return execFileSync(
		"cargo",
		[
			"tree",
			"--locked",
			"-p",
			build.crate,
			...build.args,
			"-e",
			"normal,build",
			"--prefix",
			"none",
			"-f",
			TREE_FORMAT,
		],
		{
			cwd: cratesDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: 64 * 1024 * 1024,
		},
	);
}

/**
 * One `cargo tree` line as `{ member, key }`. Workspace members are keyed by
 * their directory under crates/ with the version masked, so `changeset
 * version` bumps compare equal; external packages keep name and version.
 * Features are part of the key because feature unification can change what a
 * dependency compiles without touching any manifest of the family.
 */
function parseTreeLine(line, cratesDir) {
	const [pkg, features] = line.split("|");
	const match = /^(\S+) v(\S+)(.*)$/.exec(pkg);
	if (!match) return null;
	const [, name, version, rest] = match;
	const memberPath = [...rest.matchAll(/\(([^)]+)\)/g)]
		.map((group) => group[1])
		.find((group) => path.isAbsolute(group));
	if (memberPath === undefined) {
		return { member: null, key: `${name} ${version}${rest}|${features}` };
	}
	const member = path.relative(cratesDir, memberPath).split(path.sep)[0];
	return { member, key: `${member}|${features}` };
}

/**
 * The union of packages `builds` compile in `cratesDir`, as
 * `{ members, packages }`, or `{ error }` when cargo cannot resolve them
 * (cargo missing, crate absent at that revision, stale lockfile).
 */
function resolveBuilds(cratesDir, builds) {
	const root = fs.realpathSync(cratesDir);
	const members = new Set();
	const packages = new Set();
	for (const build of builds) {
		let output;
		try {
			output = cargoTree(root, build);
		} catch (error) {
			const detail = String(error.stderr || error.message).trim();
			const lastLine = detail.split("\n").pop();
			return { error: `cargo tree -p ${build.crate} failed: ${lastLine}` };
		}
		for (const line of output.split("\n")) {
			if (line === "" || line.endsWith("(*)")) continue;
			const parsed = parseTreeLine(line, root);
			if (parsed === null) continue;
			packages.add(parsed.key);
			if (parsed.member !== null) members.add(parsed.member);
		}
	}
	return { members, packages };
}

/**
 * Plain git for a throwaway checkout: no LFS filter and no hooks, so it works
 * without git-lfs installed. cargo only reads manifests and the lockfile.
 */
const PLAIN_GIT = [
	"-c",
	"filter.lfs.process=",
	"-c",
	"filter.lfs.smudge=",
	"-c",
	"filter.lfs.required=false",
	"-c",
	"core.hooksPath=/dev/null",
];

/** A checkout of `crates/` at `commit`, reused per commit and removed on exit. */
function checkoutCache(git) {
	const checkouts = new Map();
	const quiet = { stdio: "ignore" };
	process.on("exit", () => {
		for (const dir of checkouts.values()) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		if (checkouts.size > 0) git(["worktree", "prune"], quiet);
	});
	return (commit) => {
		const existing = checkouts.get(commit);
		if (existing) return path.join(existing, "crates");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blazediff-release-"));
		checkouts.set(commit, dir);
		git(
			[
				...PLAIN_GIT,
				"worktree",
				"add",
				"--detach",
				"--no-checkout",
				dir,
				commit,
			],
			quiet,
		);
		git([...PLAIN_GIT, "-C", dir, "checkout", commit, "--", "crates"], quiet);
		return path.join(dir, "crates");
	};
}

module.exports = { resolveBuilds, checkoutCache };
