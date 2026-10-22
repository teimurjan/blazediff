/**
 * Where and on what a benchmark ran, recorded into every artifact so a number
 * on the website always carries its machine, toolchain and commit.
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");

// A missing tool (no rustc, no uv) leaves its field out instead of failing.
function tryExec(cmd, cwd = REPO_ROOT) {
	try {
		return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "ignore"] })
			.toString()
			.trim();
	} catch {
		return undefined;
	}
}

function collectEnv({ python = false } = {}) {
	const cpus = os.cpus();
	return {
		platform: os.platform(),
		arch: os.arch(),
		osRelease: os.release(),
		cpu: cpus[0]?.model,
		cores: cpus.length,
		memoryGb: Math.round(os.totalmem() / 2 ** 30),
		node: process.version,
		rustc: tryExec("rustc -V"),
		python: python
			? tryExec(
					"uv run python -V",
					path.join(REPO_ROOT, "apps/python-benchmark"),
				)
			: undefined,
	};
}

// Results land in `benchmarks/`, so a rerun alone must not mark the tree dirty.
function collectCommit() {
	return {
		sha: tryExec("git rev-parse HEAD"),
		dirty: Boolean(
			tryExec(
				"git status --porcelain --untracked-files=no -- . ':!benchmarks'",
			),
		),
	};
}

// Walk up from `dir` like Node's resolver, without tripping on `exports` maps
// that hide `package.json`.
function npmVersion(pkg, dir) {
	for (let d = dir; ; d = path.dirname(d)) {
		const manifest = path.join(d, "node_modules", pkg, "package.json");
		if (fs.existsSync(manifest))
			return JSON.parse(fs.readFileSync(manifest, "utf8")).version;
		if (d === path.dirname(d)) return undefined;
	}
}

function pythonVersion(pkg, dir) {
	return tryExec(
		`uv run python -c "import importlib.metadata as m; print(m.version('${pkg}'))"`,
		dir,
	);
}

module.exports = { collectEnv, collectCommit, npmVersion, pythonVersion };
