#!/usr/bin/env -S deno run -A
import { fromFileUrl, join, resolve } from "jsr:@std/path";

const ROOT = resolve(fromFileUrl(import.meta.url), "..", "..");

// Sync every workspace member's deno.json version from its package.json
// (Changesets bumps package.json only), then attempt `deno publish` on
// every member. JSR rejects re-publishes of an existing version — we
// treat that specific failure as a no-op and keep going, so:
//   - a first-time seed publish lands every package in one shot
//   - subsequent releases silently skip packages whose version didn't
//     move and publish only the ones that did
const rootDeno = JSON.parse(Deno.readTextFileSync(join(ROOT, "deno.json"))) as {
	workspace?: string[];
};
const members = rootDeno.workspace ?? [];

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

	console.log(`\n--- deno publish ${member} ---`);
	// --allow-dirty: the sync step above may have just edited deno.json.
	const { code, stderr } = await new Deno.Command("deno", {
		args: ["publish", "--allow-dirty"],
		cwd: pkgDir,
		stdout: "inherit",
		stderr: "piped",
	}).output();
	const stderrText = new TextDecoder().decode(stderr);
	await Deno.stderr.write(stderr);

	if (code === 0) {
		published.push(member);
		continue;
	}

	if (/already (published|exists)/i.test(stderrText)) {
		console.log(`publish-jsr: ${member} already on JSR — skipping`);
		skipped.push(member);
		continue;
	}

	console.error(`publish-jsr: ${member} failed (exit ${code})`);
	Deno.exit(code);
}

console.log(
	`\npublish-jsr: published ${published.length}, skipped ${skipped.length}`,
);
