#!/usr/bin/env node
// Sync the blazediff PyPI wheel version from its changesets shadow into
// pyproject.toml — the PyPI counterpart of sync-cargo-version.js for crates.
//
// The wheel version lives statically in crates/blazediff/pyproject.toml (PEP
// 621), driven by the private @blazediff/rust changesets shadow package.
// maturin bakes that version into the wheel filename; publish-pypi.js reads it
// back from the same shadow.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const SHADOW_PKG_PATH = path.join(ROOT, "crates", "blazediff", "package.json");
const PYPROJECT_PATH = path.join(ROOT, "crates", "blazediff", "pyproject.toml");

// Bump the static `version = "X"` under [project] in pyproject.toml.
function syncPyproject(pyprojectPath, version) {
	const src = fs.readFileSync(pyprojectPath, "utf8");
	const next = src.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
	if (next === src) return false;
	fs.writeFileSync(pyprojectPath, next);
	return true;
}

function main() {
	const { version } = JSON.parse(fs.readFileSync(SHADOW_PKG_PATH, "utf8"));
	const changed = syncPyproject(PYPROJECT_PATH, version);
	console.log(
		`blazediff (python) → ${version}` +
			` (pyproject.toml: ${changed ? "updated" : "unchanged"})`,
	);
}

main();
