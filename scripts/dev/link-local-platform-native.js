#!/usr/bin/env node
/**
 * Links the correct platform binary package into each native package's
 * node_modules. This is needed because optionalDependencies are ignored in the
 * workspace (see pnpm-workspace.yaml's ignoredOptionalDependencies) to keep a
 * clean lockfile.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");

// Each native package and the platform-package family it consumes.
const FAMILIES = [
	{ pkg: "core-native", prefix: "core-native" },
	{ pkg: "ssim-native", prefix: "ssim-native" },
	{ pkg: "interpret-native", prefix: "interpret-native" },
];

const PLATFORM_SUFFIXES = [
	"darwin-arm64",
	"darwin-x64",
	"linux-arm64",
	"linux-x64",
	"win32-arm64",
	"win32-x64",
];

function getPlatformSuffix() {
	const key = `${os.platform()}-${os.arch()}`;
	if (!PLATFORM_SUFFIXES.includes(key)) {
		console.error(`Unsupported platform: ${key}`);
		process.exit(1);
	}
	return key;
}

function ensureSymlink(target, linkPath) {
	// Remove existing file/symlink
	try {
		fs.unlinkSync(linkPath);
	} catch {
		// File doesn't exist, that's fine
	}

	// Create relative symlink
	const linkDir = path.dirname(linkPath);
	const relativeTarget = path.relative(linkDir, target);
	fs.symlinkSync(relativeTarget, linkPath);
}

function link({ pkg, prefix }, suffix) {
	const platformPkgDir = `${prefix}-${suffix}`;
	const platformPkgPath = path.join(PACKAGES_DIR, platformPkgDir);
	const consumerDir = path.join(PACKAGES_DIR, pkg);

	if (!fs.existsSync(consumerDir)) return;
	if (!fs.existsSync(platformPkgPath)) {
		console.error(`Platform package not found: ${platformPkgPath}`);
		process.exit(1);
	}

	const nodeModules = path.join(consumerDir, "node_modules", "@blazediff");
	fs.mkdirSync(nodeModules, { recursive: true });
	const linkPath = path.join(nodeModules, platformPkgDir);

	try {
		ensureSymlink(platformPkgPath, linkPath);
		console.log(
			`Linked: @blazediff/${platformPkgDir} -> packages/${pkg}/node_modules/@blazediff/${platformPkgDir}`,
		);
	} catch (err) {
		console.error(
			`Failed to link @blazediff/${platformPkgDir}: ${err.message}`,
		);
		process.exit(1);
	}
}

function main() {
	const suffix = getPlatformSuffix();
	for (const family of FAMILIES) {
		link(family, suffix);
	}
}

main();
