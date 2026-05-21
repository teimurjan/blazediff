#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const CRATES = [
	{
		name: "blazediff",
		npmPkgPath: path.join(ROOT, "packages", "core-native", "package.json"),
		cargoTomlPath: path.join(ROOT, "crates", "blazediff", "Cargo.toml"),
	},
];

const LOCKFILE = path.join(ROOT, "crates", "Cargo.lock");

function syncCargoToml(cargoTomlPath, version) {
	const src = fs.readFileSync(cargoTomlPath, "utf8");
	const next = src.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
	if (next === src) return false;
	fs.writeFileSync(cargoTomlPath, next);
	return true;
}

function syncCargoLock(lockfilePath, crateName, version) {
	const src = fs.readFileSync(lockfilePath, "utf8");
	const re = new RegExp(
		`(\\[\\[package\\]\\]\\nname = "${crateName}"\\nversion = ")[^"]+(")`,
	);
	if (!re.test(src)) {
		throw new Error(`Could not find ${crateName} entry in ${lockfilePath}`);
	}
	const next = src.replace(re, `$1${version}$2`);
	if (next === src) return false;
	fs.writeFileSync(lockfilePath, next);
	return true;
}

function main() {
	for (const crate of CRATES) {
		const { version } = JSON.parse(fs.readFileSync(crate.npmPkgPath, "utf8"));
		const tomlChanged = syncCargoToml(crate.cargoTomlPath, version);
		const lockChanged = syncCargoLock(LOCKFILE, crate.name, version);
		console.log(
			`${crate.name} → ${version}` +
				` (Cargo.toml: ${tomlChanged ? "updated" : "unchanged"},` +
				` Cargo.lock: ${lockChanged ? "updated" : "unchanged"})`,
		);
	}
}

main();
