#!/usr/bin/env node
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Sync every workspace member's deno.json version from its package.json
// (Changesets bumps package.json only), then publish — but only if at
// least one version actually moved, so the script is a no-op on releases
// that didn't touch any JSR-published package.
const rootDeno = JSON.parse(
	fs.readFileSync(path.join(ROOT, "deno.json"), "utf8"),
);
const members = rootDeno.workspace ?? [];

let bumped = 0;

for (const member of members) {
	const pkgDir = path.resolve(ROOT, member);
	const pkgJsonPath = path.join(pkgDir, "package.json");
	const denoJsonPath = path.join(pkgDir, "deno.json");

	if (!fs.existsSync(denoJsonPath)) {
		throw new Error(`Missing deno.json for workspace member ${member}`);
	}
	if (!fs.existsSync(pkgJsonPath)) {
		throw new Error(`Missing package.json for workspace member ${member}`);
	}

	const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
	const denoJson = JSON.parse(fs.readFileSync(denoJsonPath, "utf8"));

	if (denoJson.version === pkgJson.version) continue;

	denoJson.version = pkgJson.version;
	fs.writeFileSync(denoJsonPath, `${JSON.stringify(denoJson, null, "\t")}\n`);
	console.log(`bumped ${member}: deno.json -> ${pkgJson.version}`);
	bumped++;
}

if (bumped === 0) {
	console.log("publish-jsr: no version bumps to publish");
	process.exit(0);
}

console.log(`publish-jsr: ${bumped} package(s) bumped — running jsr publish`);
execSync("npx jsr publish", { cwd: ROOT, stdio: "inherit" });
