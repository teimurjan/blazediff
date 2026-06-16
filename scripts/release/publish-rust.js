#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..", "..");
const CRATES_DIR = path.join(ROOT, "crates");

// Order matters: blazediff depends on blazediff-png, so the dependency must be
// on crates.io before blazediff's publish verification builds.
const CRATES = [
	{
		name: "blazediff-png",
		npmPkgPath: path.join(ROOT, "crates", "blazediff-png", "package.json"),
		cargoTomlPath: path.join(ROOT, "crates", "blazediff-png", "Cargo.toml"),
		dockerfile: "blazediff-png/Dockerfile.publish",
		dockerTag: "blazediff-png-publish",
	},
	{
		name: "blazediff",
		npmPkgPath: path.join(ROOT, "crates", "blazediff", "package.json"),
		cargoTomlPath: path.join(ROOT, "crates", "blazediff", "Cargo.toml"),
		dockerfile: "blazediff/Dockerfile.publish",
		dockerTag: "blazediff-publish",
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

// Poll crates.io until a freshly published version is queryable, so a
// downstream crate's publish (which resolves it from the registry) doesn't race
// the index propagation.
async function waitForCratesIo(crateName, version, tries = 30, delayMs = 5000) {
	for (let attempt = 1; attempt <= tries; attempt++) {
		if (await versionExistsOnCratesIo(crateName, version)) return;
		console.log(
			`Waiting for ${crateName}@${version} to propagate (${attempt}/${tries})...`,
		);
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
	console.log(
		`Warning: ${crateName}@${version} still not visible on crates.io after waiting`,
	);
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

	// Ensure the just-published version is visible before any dependent crate
	// later in CRATES tries to resolve it from the registry.
	await waitForCratesIo(crate.name, versions.bin);
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
