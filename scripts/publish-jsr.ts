#!/usr/bin/env -S deno run -A
import { fromFileUrl, join, resolve } from "jsr:@std/path";

const ROOT = resolve(fromFileUrl(import.meta.url), "..", "..");

// Sync every workspace member's deno.json version from its package.json
// (Changesets bumps package.json only), then publish only the members
// whose version actually moved — so a release that only touched
// NPM-only packages (e.g. core-native-darwin-*) doesn't try to
// republish unchanged JSR packages and error on "version already
// published".
//
// First-time seed publish: versions in deno.json and package.json
// already match, so nothing bumps. Run `deno publish --allow-dirty`
// from the repo root once to put everything on JSR; after that,
// Changesets-driven bumps feed this script on every release.
const rootDeno = JSON.parse(Deno.readTextFileSync(join(ROOT, "deno.json"))) as {
	workspace?: string[];
};
const members = rootDeno.workspace ?? [];

const bumped: string[] = [];

for (const member of members) {
	const pkgDir = resolve(ROOT, member);
	const pkgJsonPath = join(pkgDir, "package.json");
	const denoJsonPath = join(pkgDir, "deno.json");

	const pkgJson = JSON.parse(Deno.readTextFileSync(pkgJsonPath)) as {
		version: string;
	};
	const denoJson = JSON.parse(Deno.readTextFileSync(denoJsonPath)) as {
		version: string;
	};

	if (denoJson.version === pkgJson.version) continue;

	denoJson.version = pkgJson.version;
	Deno.writeTextFileSync(
		denoJsonPath,
		`${JSON.stringify(denoJson, null, "\t")}\n`,
	);
	console.log(`bumped ${member}: deno.json -> ${pkgJson.version}`);
	bumped.push(member);
}

if (bumped.length === 0) {
	console.log("publish-jsr: no version bumps to publish");
	Deno.exit(0);
}

console.log(
	`publish-jsr: ${bumped.length} package(s) bumped — publishing to JSR`,
);

// Publish each bumped member from its own directory so we don't
// touch workspace members whose versions are already on JSR.
// --allow-dirty: the sync step above just edited deno.json.
for (const member of bumped) {
	const pkgDir = resolve(ROOT, member);
	console.log(`\n--- deno publish ${member} ---`);
	const { code } = await new Deno.Command("deno", {
		args: ["publish", "--allow-dirty"],
		cwd: pkgDir,
		stdout: "inherit",
		stderr: "inherit",
	}).output();
	if (code !== 0) Deno.exit(code);
}
