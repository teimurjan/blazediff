#!/usr/bin/env -S deno run -A
import { fromFileUrl, join, resolve } from "jsr:@std/path";

const ROOT = resolve(fromFileUrl(import.meta.url), "..", "..");

// For every workspace member:
//   1. mirror deno.json#version from package.json#version (Changesets
//      only bumps package.json)
//   2. ask JSR whether this version is already published — if so, skip
//   3. otherwise run `deno publish --allow-dirty` with full stdio
//      inherited so the interactive browser OAuth flow works
//
// The skip check uses JSR's meta.json API instead of parsing stderr
// from `deno publish`, so we can keep stdio inherited and still know
// whether to publish.
const rootDeno = JSON.parse(Deno.readTextFileSync(join(ROOT, "deno.json"))) as {
	workspace?: string[];
};
const members = rootDeno.workspace ?? [];

async function isVersionOnJsr(name: string, version: string): Promise<boolean> {
	const res = await fetch(`https://jsr.io/${name}/meta.json`);
	if (res.status === 404) return false;
	if (!res.ok) {
		throw new Error(
			`JSR registry lookup for ${name} failed: ${res.status} ${res.statusText}`,
		);
	}
	const meta = (await res.json()) as { versions?: Record<string, unknown> };
	return Object.hasOwn(meta.versions ?? {}, version);
}

const published: string[] = [];
const skipped: string[] = [];

for (const member of members) {
	const pkgDir = resolve(ROOT, member);
	const pkgJsonPath = join(pkgDir, "package.json");
	const denoJsonPath = join(pkgDir, "deno.json");

	const pkgJson = JSON.parse(Deno.readTextFileSync(pkgJsonPath)) as {
		version: string;
	};
	const denoJson = JSON.parse(Deno.readTextFileSync(denoJsonPath)) as {
		name: string;
		version: string;
	};

	if (denoJson.version !== pkgJson.version) {
		denoJson.version = pkgJson.version;
		Deno.writeTextFileSync(
			denoJsonPath,
			`${JSON.stringify(denoJson, null, "\t")}\n`,
		);
		console.log(`bumped ${member}: deno.json -> ${pkgJson.version}`);
	}

	if (await isVersionOnJsr(denoJson.name, denoJson.version)) {
		console.log(
			`publish-jsr: ${denoJson.name}@${denoJson.version} already on JSR — skipping`,
		);
		skipped.push(member);
		continue;
	}

	console.log(`\n--- deno publish ${member} ---`);
	// All stdio inherited so the first-run browser OAuth flow can prompt
	// the user. --allow-dirty because the sync step may have just edited
	// deno.json.
	const { code } = await new Deno.Command("deno", {
		args: ["publish", "--allow-dirty"],
		cwd: pkgDir,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	}).output();

	if (code !== 0) {
		console.error(`publish-jsr: ${member} failed (exit ${code})`);
		Deno.exit(code);
	}
	published.push(member);
}

console.log(
	`\npublish-jsr: published ${published.length}, skipped ${skipped.length}`,
);
