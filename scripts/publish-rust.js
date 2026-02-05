#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BIN_PKG_PATH = path.join(ROOT, "packages", "bin", "package.json");
const CARGO_TOML_PATH = path.join(ROOT, "rust", "Cargo.toml");

function getVersions() {
	const binPkg = JSON.parse(fs.readFileSync(BIN_PKG_PATH, "utf8"));
	const cargoToml = fs.readFileSync(CARGO_TOML_PATH, "utf8");
	const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
	return {
		bin: binPkg.version,
		rust: match?.[1],
	};
}

function syncVersion(targetVersion) {
	const cargoToml = fs.readFileSync(CARGO_TOML_PATH, "utf8");
	const newCargoToml = cargoToml.replace(
		/^version\s*=\s*"[^"]+"/m,
		`version = "${targetVersion}"`,
	);
	fs.writeFileSync(CARGO_TOML_PATH, newCargoToml);
	console.log(`Synced Cargo.toml to version ${targetVersion}`);
}

function main() {
	const token = process.env.CRATES_IO_TOKEN;
	if (!token) {
		console.log("CRATES_IO_TOKEN not set, skipping crates.io publish");
		return;
	}

	const versions = getVersions();
	console.log(`@blazediff/bin version: ${versions.bin}`);
	console.log(`Cargo.toml version: ${versions.rust}`);

	if (versions.bin !== versions.rust) {
		syncVersion(versions.bin);
	}

	console.log("Publishing to crates.io...");
	try {
		execSync(`cargo publish --allow-dirty --token ${token}`, {
			cwd: path.join(ROOT, "rust"),
			stdio: "inherit",
		});
		console.log("Published to crates.io");
	} catch (err) {
		const stderr = err.stderr?.toString() || err.message || "";
		if (stderr.includes("already uploaded") || stderr.includes("already exists")) {
			console.log(`Version ${versions.bin} already published, skipping`);
			return;
		}
		throw err;
	}
}

main();
