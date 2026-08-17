#!/usr/bin/env node

// Makes every workspace package publishable by OIDC, so `changeset publish`
// doesn't have to be the first thing that ever touches a new package name.
//
// One rule per package:
//   not on npm  → publish a placeholder to claim the name, then register trust
//   on npm      → register trust, unless it already has some
//
// The placeholder is deliberate: version `0.0.0-oidc-seed` under dist-tag
// `oidc-seed`. A prerelease matches no `^x.y.z` range and a non-`latest` tag is
// not what a bare `npm install` resolves, so it can't be reached by accident and
// it burns no real version number. That is also why this script never needs the
// compiled binaries — the platform packages seed fine with nothing built.
//
// Only `version` is changed in the manifest, and the original file is written
// back byte-for-byte afterwards, including on Ctrl-C.
//
// Everything is idempotent: seeded names are skipped on the next run, and so are
// packages that already carry a trusted publisher.
//
// A note on 2FA. An account set to "auth-and-writes" (`npm profile get`) needs
// interactive authentication for every publish *and* every trust registration —
// that is the browser prompt that appears mid-run. `npm publish` takes `--otp`,
// but `npm trust` has no such flag, and a 30-second code would expire partway
// through a run of this size anyway. Relax the setting for the duration:
//
//   npm profile enable-2fa auth-only
//   pnpm setup:npm-oidc
//   npm profile enable-2fa auth-and-writes
//
// Usage:
//   node scripts/release/setup-npm-oidc.js [--dry-run] [--filter <substr>]

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");

// Must match `release.yml`: the workflow filename and its `environment:` are
// both part of what npm verifies in the OIDC claim.
const WORKFLOW = "release.yml";
const ENVIRONMENT = "npm";

const SEED_VERSION = "0.0.0-oidc-seed";
const SEED_TAG = "oidc-seed";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILTER = args[args.indexOf("--filter") + 1];
const filterActive = args.includes("--filter") && Boolean(FILTER);

function run(file, argv, opts = {}) {
	return execFileSync(file, argv, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...opts,
	});
}

/** `owner/repo`, from the root package.json rather than hardcoded. */
function repoSlug() {
	const { repository } = JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
	);
	const url = typeof repository === "string" ? repository : repository?.url;
	const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(url ?? "");
	if (!match) {
		throw new Error(`Could not read a GitHub repo from package.json: ${url}`);
	}
	return match[1];
}

function ensureLoggedIn() {
	const whoami = () => {
		try {
			return run("npm", ["whoami"]).trim();
		} catch {
			return null;
		}
	};

	let user = whoami();
	if (!user) {
		console.log("npm: not logged in — starting `npm login`");
		// Interactive: npm opens a browser and waits, so it needs the real stdio.
		if (spawnSync("npm", ["login"], { stdio: "inherit" }).status !== 0) {
			throw new Error("npm login failed");
		}
		user = whoami();
		if (!user) throw new Error("still not logged in after `npm login`");
	}
	console.log(`npm: logged in as ${user}`);
}

/** Every workspace package under packages/ that npm would accept. */
function publishablePackages() {
	return fs
		.readdirSync(PACKAGES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(PACKAGES_DIR, entry.name))
		.filter((dir) => fs.existsSync(path.join(dir, "package.json")))
		.map((dir) => ({
			dir,
			manifest: JSON.parse(
				fs.readFileSync(path.join(dir, "package.json"), "utf8"),
			),
		}))
		.filter(({ manifest }) => manifest.name && manifest.private !== true)
		.filter(({ manifest }) => !filterActive || manifest.name.includes(FILTER))
		.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/**
 * Every published version, newest last; empty when npm has never seen the name.
 *
 * Deliberately not `npm view <name> version`, which reports the `latest` tag —
 * a package carrying only a seed publish has no `latest`, and would read back
 * as unpublished on the next run.
 */
function publishedVersions(name) {
	let stdout;
	try {
		stdout = run("npm", ["view", name, "versions", "--json"]);
	} catch (error) {
		// npm exits non-zero for a package it can't find, but `--json` still
		// puts a structured error body on stdout. The human text goes to stderr.
		stdout = error.stdout ?? "";
	}

	let parsed;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error(
			`could not read published versions for ${name} — npm said: ${
				stdout.trim().split("\n")[0] || "(nothing)"
			}`,
		);
	}

	if (Array.isArray(parsed)) return parsed;
	if (typeof parsed === "string") return [parsed]; // a single published version
	if (parsed?.error?.code === "E404") return [];

	// Anything else — a network blip, a rate limit, an expired session — means
	// *unknown*, which is not the same as unpublished. Treating it as
	// unpublished is how an already-published package gets published over.
	throw new Error(
		`could not determine whether ${name} is published: ${
			parsed?.error?.summary ?? parsed?.error?.code ?? stdout.trim()
		}`,
	);
}

/**
 * Runs npm with its output captured, so a failure can be classified rather than
 * just dumped. stdin stays attached in case npm decides to prompt.
 */
function npmQuiet(argv, opts = {}) {
	try {
		return {
			ok: true,
			output: execFileSync("npm", argv, {
				encoding: "utf8",
				stdio: ["inherit", "pipe", "pipe"],
				...opts,
			}),
		};
	} catch (error) {
		return {
			ok: false,
			output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
		};
	}
}

/** The `npm error ...` lines, which is the part worth showing on a failure. */
function npmErrorSummary(output) {
	const lines = output
		.split("\n")
		.filter((line) => line.includes("npm error"))
		.slice(0, 3)
		.join("; ");
	return lines || output.trim().split("\n").slice(-1)[0] || "npm failed";
}

// Manifests currently rewritten, against their original contents. `finally`
// covers a throwing npm, but not a Ctrl-C during an inherited-stdio publish,
// which kills this process outright — hence the signal handlers.
const rewritten = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		for (const [file, contents] of rewritten) fs.writeFileSync(file, contents);
		process.exit(130);
	});
}

/** Claim the name with a placeholder, leaving the manifest as it was found. */
function seed({ dir, manifest }) {
	if (DRY_RUN) {
		console.log(`  would seed ${SEED_VERSION} (dist-tag ${SEED_TAG})`);
		return;
	}

	const manifestPath = path.join(dir, "package.json");
	const original = fs.readFileSync(manifestPath, "utf8");
	rewritten.set(manifestPath, original);
	try {
		fs.writeFileSync(
			manifestPath,
			`${JSON.stringify({ ...manifest, version: SEED_VERSION }, null, "\t")}\n`,
		);
		const { ok, output } = npmQuiet(
			["publish", "--access", "public", "--tag", SEED_TAG],
			{ cwd: dir },
		);
		if (!ok) throw new Error(npmErrorSummary(output));
	} finally {
		fs.writeFileSync(manifestPath, original);
		rewritten.delete(manifestPath);
	}
}

/**
 * Registers the trusted publisher. Returns "created", or "exists" when npm
 * already had one.
 *
 * There is deliberately no check-before-write: `npm trust list` is OTP-gated
 * even on a read, so asking is less reliable than trying. npm answers a
 * duplicate with 409 Conflict, which is the authoritative "already trusted".
 *
 * A 409 does not prove the *existing* config matches the one requested here —
 * only that one is present. `npm trust list <pkg>` shows it, once 2FA allows.
 */
function trust(name, slug) {
	const argv = [
		"trust",
		"github",
		name,
		"--file",
		WORKFLOW,
		"--repo",
		slug,
		"--env",
		ENVIRONMENT,
		"--allow-publish",
		"--yes",
	];
	if (DRY_RUN) {
		console.log(`  would run: npm ${argv.join(" ")}`);
		return "created";
	}

	const { ok, output } = npmQuiet(argv);
	if (ok) return "created";
	if (/\bE?409\b|Conflict/.test(output)) return "exists";
	throw new Error(npmErrorSummary(output));
}

function main() {
	const slug = repoSlug();
	console.log(
		`Trusted publisher target: ${slug} · ${WORKFLOW} · environment "${ENVIRONMENT}"`,
	);
	if (DRY_RUN) console.log("(dry run — nothing will be published or changed)");

	ensureLoggedIn();

	const packages = publishablePackages();
	console.log(`\nChecking ${packages.length} publishable packages…\n`);

	const seeded = [];
	const trusted = [];
	const skipped = [];
	// One package failing shouldn't cost the run: this is idempotent, but a
	// mid-run abort still means re-checking everything to find where it stopped.
	const failed = [];

	for (const pkg of packages) {
		const name = pkg.manifest.name;
		try {
			const versions = publishedVersions(name);

			let state;
			if (versions.length === 0) {
				seed(pkg);
				seeded.push(name);
				state = `seeded ${SEED_VERSION}`;
			} else {
				state = `on npm (${versions[versions.length - 1]})`;
			}

			if (trust(name, slug) === "exists") {
				skipped.push(name);
				console.log(`▸ ${name} — ${state}, already trusted`);
			} else {
				trusted.push(name);
				console.log(`▸ ${name} — ${state}, trust registered`);
			}
		} catch (error) {
			console.error(`▸ ${name} — failed: ${error.message.split("\n")[0]}`);
			failed.push(name);
		}
	}

	console.log(
		`\n${seeded.length} seeded · ${trusted.length} trusted · ` +
			`${skipped.length} already trusted · ${failed.length} failed`,
	);
	if (failed.length > 0) {
		console.error(`\nfailed: ${failed.join(", ")}\n  Re-run to retry these.`);
		process.exit(1);
	}
}

try {
	main();
} catch (error) {
	console.error(`\nerror: ${error.message}`);
	process.exit(1);
}
