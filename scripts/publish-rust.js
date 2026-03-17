#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..");
const CRATES_DIR = path.join(ROOT, "crates");

const CRATES = [
	{
		name: "blazediff",
		npmPkgPath: path.join(ROOT, "packages", "core-native", "package.json"),
		cargoTomlPath: path.join(ROOT, "crates", "blazediff", "Cargo.toml"),
		dockerfile: "blazediff/Dockerfile.publish",
		dockerTag: "blazediff-publish",
	},
	{
		name: "blazediff-interpret",
		npmPkgPath: path.join(ROOT, "packages", "interpret-native", "package.json"),
		cargoTomlPath: path.join(
			ROOT,
			"crates",
			"blazediff-interpret",
			"Cargo.toml",
		),
		dockerfile: "blazediff-interpret/Dockerfile.publish",
		dockerTag: "blazediff-interpret-publish",
	},
];

function getVersions(npmPkgPath, cargoTomlPath) {
	const binPkg = JSON.parse(fs.readFileSync(npmPkgPath, "utf8"));
	const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
	const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
	return {
		bin: binPkg.version,
		rust: match?.[1],
	};
}

async function versionExistsOnCratesIo(crateName, version) {
	try {
		const res = await fetch(
			`https://crates.io/api/v1/crates/${crateName}/${version}`,
			{
				headers: {
					"User-Agent":
						"blazediff-publish-script (https://github.com/teimurjan/blazediff)",
				},
			},
		);
		if (res.ok) {
			console.log(`Found ${crateName}@${version} on crates.io`);
			return true;
		}
		console.log(
			`${crateName}@${version} not found on crates.io (status: ${res.status})`,
		);
		return false;
	} catch (err) {
		console.log(`Failed to check crates.io: ${err.message}`);
		return false;
	}
}

function syncVersion(cargoTomlPath, targetVersion) {
	const cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
	const newCargoToml = cargoToml.replace(
		/^version\s*=\s*"[^"]+"/m,
		`version = "${targetVersion}"`,
	);
	fs.writeFileSync(cargoTomlPath, newCargoToml);
	console.log(`Synced ${cargoTomlPath} to version ${targetVersion}`);
}

async function publishCrate(crate, token) {
	console.log(`\n--- Publishing ${crate.name} ---`);

	const versions = getVersions(crate.npmPkgPath, crate.cargoTomlPath);
	console.log(`NPM package version: ${versions.bin}`);
	console.log(`Cargo.toml version: ${versions.rust}`);

	if (versions.bin !== versions.rust) {
		syncVersion(crate.cargoTomlPath, versions.bin);
	}

	if (await versionExistsOnCratesIo(crate.name, versions.bin)) {
		console.log(
			`Version ${versions.bin} already exists on crates.io, skipping`,
		);
		return;
	}

	console.log(`Publishing ${crate.name} to crates.io via Docker...`);

	const tokenFile = path.join(os.tmpdir(), "crates_token");
	fs.writeFileSync(tokenFile, token, { mode: 0o600 });

	try {
		execSync(`docker build -f ${crate.dockerfile} -t ${crate.dockerTag} .`, {
			cwd: CRATES_DIR,
			stdio: "inherit",
		});

		execSync(
			`docker run --rm -v ${tokenFile}:/run/secrets/crates_token:ro ${crate.dockerTag}`,
			{ cwd: CRATES_DIR, stdio: "inherit" },
		);

		console.log(`Published ${crate.name} to crates.io`);
	} finally {
		fs.unlinkSync(tokenFile);
	}
}

async function main() {
	const token = process.env.CRATES_IO_TOKEN;
	if (!token) {
		console.log("CRATES_IO_TOKEN not set, skipping crates.io publish");
		return;
	}

	for (const crate of CRATES) {
		await publishCrate(crate, token);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
