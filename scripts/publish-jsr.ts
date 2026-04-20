#!/usr/bin/env -S deno run -A
import { fromFileUrl, join, resolve } from "jsr:@std/path";

const ROOT = resolve(fromFileUrl(import.meta.url), "..", "..");

// 1. Mirror deno.json#version from package.json#version across the
//    workspace (Changesets only bumps package.json).
// 2. Apply every workspace member's jsr.patch up-front. Patches are
//    plain unified diffs (run with `patch -p1`) that add Node-only
//    imports the NPM/Vite bundle doesn't need but JSR's publish-time
//    `deno check` does. We apply *all* patches before publishing any
//    package because JSR's type-check follows imports into workspace
//    source — matcher publishing still type-checks core/codec-pngjs.
// 3. For each member: skip if its version is already on JSR; otherwise
//    run `deno publish --allow-dirty` from its own directory with
//    stdio inherited so the first-run browser OAuth flow works.
// 4. Revert every applied patch in a `finally`, even on crash, so the
//    working tree ends clean.

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

async function runPatch(pkgDir: string, reverse: boolean): Promise<void> {
	const args = reverse
		? ["-p1", "-R", "-i", "jsr.patch", "--silent"]
		: ["-p1", "-i", "jsr.patch", "--silent"];
	const { code, stderr } = await new Deno.Command("patch", {
		args,
		cwd: pkgDir,
		stdout: "inherit",
		stderr: "piped",
	}).output();
	if (code !== 0) {
		await Deno.stderr.write(stderr);
		throw new Error(
			`patch ${reverse ? "-R " : ""}-i jsr.patch failed in ${pkgDir} (exit ${code})`,
		);
	}
}

async function hasPatch(pkgDir: string): Promise<boolean> {
	try {
		await Deno.stat(join(pkgDir, "jsr.patch"));
		return true;
	} catch (err) {
		if (err instanceof Deno.errors.NotFound) return false;
		throw err;
	}
}

// --- sync versions ---
for (const member of members) {
	const pkgDir = resolve(ROOT, member);
	const pkgJson = JSON.parse(
		Deno.readTextFileSync(join(pkgDir, "package.json")),
	) as { version: string };
	const denoJsonPath = join(pkgDir, "deno.json");
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
}

// --- apply all patches ---
const patched: string[] = [];
try {
	for (const member of members) {
		const pkgDir = resolve(ROOT, member);
		if (await hasPatch(pkgDir)) {
			await runPatch(pkgDir, false);
			patched.push(pkgDir);
			console.log(`applied jsr.patch for ${member}`);
		}
	}

	// --- publish each member ---
	const published: string[] = [];
	const skipped: string[] = [];
	for (const member of members) {
		const pkgDir = resolve(ROOT, member);
		const denoJson = JSON.parse(
			Deno.readTextFileSync(join(pkgDir, "deno.json")),
		) as { name: string; version: string };

		if (await isVersionOnJsr(denoJson.name, denoJson.version)) {
			console.log(
				`${denoJson.name}@${denoJson.version} already on JSR — skipping`,
			);
			skipped.push(member);
			continue;
		}

		console.log(`\n--- deno publish ${member} ---`);
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
} finally {
	for (const pkgDir of patched.reverse()) {
		try {
			await runPatch(pkgDir, true);
		} catch (err) {
			console.error(`revert failed for ${pkgDir}:`, err);
		}
	}
}
