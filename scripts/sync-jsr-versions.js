#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const JSR_PACKAGES = [
	"core",
	"object",
	"ssim",
	"gmsd",
	"codec-pngjs",
	"codec-sharp",
	"codec-jsquash-png",
	"ui",
	"react",
	"core-native",
	"matcher",
	"cli",
	"vitest",
	"jest",
];

let changed = 0;

for (const pkg of JSR_PACKAGES) {
	const pkgDir = path.join(ROOT, "packages", pkg);
	const pkgJsonPath = path.join(pkgDir, "package.json");
	const jsrJsonPath = path.join(pkgDir, "deno.json");

	if (!fs.existsSync(jsrJsonPath)) {
		throw new Error(`Missing deno.json for ${pkg}`);
	}

	const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
	const jsrJson = JSON.parse(fs.readFileSync(jsrJsonPath, "utf8"));

	if (jsrJson.version === pkgJson.version) {
		continue;
	}

	jsrJson.version = pkgJson.version;
	fs.writeFileSync(jsrJsonPath, `${JSON.stringify(jsrJson, null, "\t")}\n`);
	console.log(`synced ${pkg}: deno.json -> ${pkgJson.version}`);
	changed++;
}

console.log(`sync-jsr-versions: ${changed} file(s) updated`);
