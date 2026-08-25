#!/usr/bin/env node
// Sync each PyPI wheel version from its changesets shadow into pyproject.toml —
// the PyPI counterpart of sync-cargo-version.js for crates.
//
// A wheel version lives statically in its crate's pyproject.toml (PEP 621),
// driven by that crate's private changesets shadow package. maturin bakes the
// version into the wheel filename; publish-pypi.js reads it back from the same
// shadow.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const crate = (dir) => ({
	shadowPkgPath: path.join(ROOT, "crates", dir, "package.json"),
	pyprojectPath: path.join(ROOT, "crates", dir, "pyproject.toml"),
});

// One entry per PyPI distribution. The shadow each reads is fixed to that
// family's npm packages in .changeset/config.json, so a wheel always carries
// the same version as the .node files built from the same sources.
const PACKAGES = [
	// blazediff        ← @blazediff/rust
	crate("blazediff"),
	// blazediff-ssim   ← @blazediff/rust-ssim
	crate("blazediff-ssim"),
	// blazediff-interpret ← @blazediff/rust-interpret
	crate("blazediff-interpret"),
];

// Bump the static `version = "X"` under [project] in pyproject.toml.
function syncPyproject(pyprojectPath, version) {
	const src = fs.readFileSync(pyprojectPath, "utf8");
	const next = src.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
	if (next === src) return false;
	fs.writeFileSync(pyprojectPath, next);
	return true;
}

function main() {
	for (const { shadowPkgPath, pyprojectPath } of PACKAGES) {
		const { version } = JSON.parse(fs.readFileSync(shadowPkgPath, "utf8"));
		const name = fs
			.readFileSync(pyprojectPath, "utf8")
			.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
		const changed = syncPyproject(pyprojectPath, version);
		console.log(
			`${name} (python) → ${version}` +
				` (pyproject.toml: ${changed ? "updated" : "unchanged"})`,
		);
	}
}

main();
