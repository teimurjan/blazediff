#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..");
const BIN_PKG_PATH = path.join(ROOT, "packages", "bin", "package.json");
const CARGO_TOML_PATH = path.join(ROOT, "rust", "Cargo.toml");
const RUST_DIR = path.join(ROOT, "rust");
const CRATE_NAME = "blazediff";

function getVersions() {
	const binPkg = JSON.parse(fs.readFileSync(BIN_PKG_PATH, "utf8"));
	const cargoToml = fs.readFileSync(CARGO_TOML_PATH, "utf8");
	const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
	return {
		bin: binPkg.version,
		rust: match?.[1],
	};
}

async function versionExistsOnCratesIo(version) {
	try {
		const res = await fetch(
			`https://crates.io/api/v1/crates/${CRATE_NAME}/${version}`,
		);
		return res.ok;
	} catch {
		return false;
	}
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

async function main() {
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

	if (await versionExistsOnCratesIo(versions.bin)) {
		console.log(
			`Version ${versions.bin} already exists on crates.io, skipping`,
		);
		return;
	}

	console.log("Publishing to crates.io via Docker...");

	const tokenFile = path.join(os.tmpdir(), "crates_token");
	fs.writeFileSync(tokenFile, token, { mode: 0o600 });

	try {
		execSync(`docker build -f Dockerfile.publish -t blazediff-publish .`, {
			cwd: RUST_DIR,
			stdio: "inherit",
		});

		execSync(
			`docker run --rm -v ${tokenFile}:/run/secrets/crates_token:ro blazediff-publish`,
			{ cwd: RUST_DIR, stdio: "inherit" },
		);

		console.log("Published to crates.io");
	} finally {
		fs.unlinkSync(tokenFile);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
