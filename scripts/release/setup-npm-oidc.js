#!/usr/bin/env node

// One-shot onboarding for npm packages that have never been published.
//
// Releases publish through OIDC (see .github/workflows/release.yml), which needs
// a trusted publisher registered against each package. New packages are the
// awkward case: `changeset publish` will try to publish them by OIDC on the very
// first release, before any trust relationship exists. This script closes that
// gap so a release doesn't have to.
//
// Logic, per publishable workspace package:
//   - already on npm      → nothing to publish; ensure trust with --all
//   - not on npm          → publish it once from here, then register trust
//   - payload incomplete  → refuse, and say what's missing
//
// That last check matters more than it looks. The platform packages ship a
// single `.node` and nothing else, so publishing one whose binary hasn't been
// built produces an empty package at a version number that can never be reused.
// Build first (`pnpm build:rust:*`, or `/build` on the PR), then run this.
//
// Everything is idempotent: re-running skips packages already published and
// already trusted.
//
// Usage:
//   node scripts/release/setup-npm-oidc.js [--dry-run] [--all] [--filter <substr>]

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");

// Must match `release.yml`: the workflow filename and its `environment:` are
// both part of what npm verifies in the OIDC claim.
const WORKFLOW = "release.yml";
const ENVIRONMENT = "npm";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");
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

function loggedInAs() {
	try {
		return run("npm", ["whoami"]).trim();
	} catch {
		return null;
	}
}

function ensureLoggedIn() {
	let user = loggedInAs();
	if (user) {
		console.log(`npm: logged in as ${user}`);
		return user;
	}

	console.log("npm: not logged in — starting `npm login`");
	// Interactive: npm opens a browser and waits, so it needs the real stdio.
	const login = spawnSync("npm", ["login"], { stdio: "inherit" });
	if (login.status !== 0) {
		throw new Error("npm login failed");
	}

	user = loggedInAs();
	if (!user) {
		throw new Error("still not logged in after `npm login`");
	}
	console.log(`npm: logged in as ${user}`);
	return user;
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

/** Published version, or null when npm has never seen the name. */
function publishedVersion(name) {
	try {
		return run("npm", ["view", name, "version"]).trim() || null;
	} catch {
		return null;
	}
}

/**
 * What `npm publish` would actually ship, checked against what exists on disk.
 *
 * `files` entries are globs in general, but this repo only ever lists literal
 * paths and directories, so a plain existence check is enough — and a wrong
 * answer here fails loudly rather than silently publishing an empty package.
 */
function missingPayload({ dir, manifest }) {
	const entries = Array.isArray(manifest.files) ? manifest.files : [];
	const missing = entries.filter(
		(entry) => !fs.existsSync(path.join(dir, entry)),
	);
	if (manifest.main && !fs.existsSync(path.join(dir, manifest.main))) {
		missing.push(manifest.main);
	}
	return [...new Set(missing)];
}

/** True when npm already holds any trusted publisher for the package. */
function hasTrust(name) {
	try {
		const out = run("npm", ["trust", "list", name, "--json"]);
		const parsed = JSON.parse(out);
		const list = Array.isArray(parsed) ? parsed : (parsed?.trust ?? []);
		return Array.isArray(list) && list.length > 0;
	} catch {
		// Either the package has no trust entries, or `--json` isn't understood
		// by this npm. Fall back to the human output; an empty result is the
		// signal we care about either way.
		try {
			const out = run("npm", ["trust", "list", name]);
			return /github|gitlab|circleci/i.test(out);
		} catch {
			return false;
		}
	}
}

function publish({ dir, manifest }) {
	if (DRY_RUN) {
		console.log(`  would publish ${manifest.name}@${manifest.version}`);
		return;
	}
	// No --provenance: that needs the OIDC context of a CI run, which is the
	// thing this script exists to make possible in the first place.
	execFileSync("npm", ["publish", "--access", "public"], {
		cwd: dir,
		stdio: "inherit",
	});
}

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
		return;
	}
	execFileSync("npm", argv, { stdio: "inherit" });
}

function main() {
	const slug = repoSlug();
	console.log(
		`Trusted publisher target: ${slug} · ${WORKFLOW} · environment "${ENVIRONMENT}"`,
	);
	if (DRY_RUN)
		console.log("(dry run — nothing will be published or changed)\n");

	ensureLoggedIn();

	const packages = publishablePackages();
	console.log(`\nChecking ${packages.length} publishable packages…\n`);

	const unpublished = [];
	const published = [];
	for (const pkg of packages) {
		const version = publishedVersion(pkg.manifest.name);
		(version ? published : unpublished).push({ ...pkg, version });
	}

	console.log(`  ${published.length} already on npm`);
	console.log(`  ${unpublished.length} not yet published`);

	// Refuse the whole run rather than publish a half-empty package: a version
	// number spent on a broken tarball is not recoverable.
	const blocked = unpublished
		.map((pkg) => ({ pkg, missing: missingPayload(pkg) }))
		.filter(({ missing }) => missing.length > 0);
	if (blocked.length > 0) {
		console.error("\nerror: these packages would publish without their files:");
		for (const { pkg, missing } of blocked) {
			console.error(`  ${pkg.manifest.name} — missing ${missing.join(", ")}`);
		}
		console.error(
			"\n       Build them first, then re-run:\n" +
				"         pnpm build            # dist/ for the JS wrappers\n" +
				"         pnpm build:rust       # core-native binaries\n" +
				"         pnpm build:rust:ssim\n" +
				"         pnpm build:rust:interpret\n" +
				"       Or comment /build on the PR and pull the result.",
		);
		process.exit(1);
	}

	if (unpublished.length > 0) {
		console.log("\nPublishing new packages:");
		for (const pkg of unpublished) {
			console.log(`\n▸ ${pkg.manifest.name}@${pkg.manifest.version}`);
			publish(pkg);
		}
	}

	const needTrust = ALL ? [...unpublished, ...published] : unpublished;
	if (needTrust.length > 0) {
		console.log("\nRegistering trusted publishers:");
		for (const pkg of needTrust) {
			const name = pkg.manifest.name;
			if (!DRY_RUN && hasTrust(name)) {
				console.log(`  ${name} — already trusted, skipping`);
				continue;
			}
			console.log(`\n▸ ${name}`);
			trust(name, slug);
		}
	}

	console.log(
		unpublished.length === 0 && !ALL
			? "\nNothing to do — every package is already published."
			: "\nDone. Releases can now publish these by OIDC.",
	);
}

try {
	main();
} catch (error) {
	console.error(`\nerror: ${error.message}`);
	process.exit(1);
}
