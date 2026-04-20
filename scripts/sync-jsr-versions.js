#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Single source of truth: the `workspace` list in the root deno.json. Every
// workspace member that has a deno.json is a JSR-published package; its
// version must mirror package.json so Changesets bumps propagate.
const rootDeno = JSON.parse(
	fs.readFileSync(path.join(ROOT, "deno.json"), "utf8"),
);
const members = rootDeno.workspace ?? [];

let changed = 0;

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

	if (denoJson.version === pkgJson.version) {
		continue;
	}

	denoJson.version = pkgJson.version;
	fs.writeFileSync(denoJsonPath, `${JSON.stringify(denoJson, null, "\t")}\n`);
	console.log(`synced ${member}: deno.json -> ${pkgJson.version}`);
	changed++;
}

console.log(`sync-jsr-versions: ${changed} file(s) updated`);
