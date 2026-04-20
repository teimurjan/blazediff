#!/usr/bin/env -S deno run -A
import { fromFileUrl, join, resolve } from "jsr:@std/path";

const ROOT = resolve(fromFileUrl(import.meta.url), "..", "..");

// Sync every workspace member's deno.json version from its package.json
// (Changesets bumps package.json only), then publish — but only if at
// least one version actually moved, so releases that only touched
// NPM-only packages (e.g. core-native-darwin-*) don't try to republish
// unchanged JSR packages and error on "version already published".
const rootDeno = JSON.parse(Deno.readTextFileSync(join(ROOT, "deno.json"))) as {
	workspace?: string[];
};
const members = rootDeno.workspace ?? [];

let bumped = 0;

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
	bumped++;
}

if (bumped === 0) {
	console.log("publish-jsr: no version bumps to publish");
	Deno.exit(0);
}

console.log(`publish-jsr: ${bumped} package(s) bumped — running deno publish`);

// --allow-dirty because the version sync above just modified deno.json
// files; in CI those edits live only on the runner, and locally we trust
// the user to review before pushing.
const cmd = new Deno.Command("deno", {
	args: ["publish", "--allow-dirty"],
	cwd: ROOT,
	stdout: "inherit",
	stderr: "inherit",
});
const { code } = await cmd.output();
Deno.exit(code);
