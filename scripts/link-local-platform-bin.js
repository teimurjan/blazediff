#!/usr/bin/env node
/**
 * Links the correct platform binary package to @blazediff/bin's node_modules.
 * This is needed because optionalDependencies are ignored in the workspace
 * to keep a clean lockfile.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const BIN_PKG_DIR = path.join(PACKAGES_DIR, "bin");

const PLATFORM_MAP = {
	"darwin-arm64": "bin-darwin-arm64",
	"darwin-x64": "bin-darwin-x64",
	"linux-arm64": "bin-linux-arm64",
	"linux-x64": "bin-linux-x64",
	"win32-arm64": "bin-win32-arm64",
	"win32-x64": "bin-win32-x64",
};

function getPlatformKey() {
	return `${os.platform()}-${os.arch()}`;
}

function getPlatformPackageDir() {
	const key = getPlatformKey();
	const pkgDir = PLATFORM_MAP[key];
	if (!pkgDir) {
		console.error(`Unsupported platform: ${key}`);
		process.exit(1);
	}
	return pkgDir;
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

function main() {
	const platformPkgDir = getPlatformPackageDir();
	const platformPkgPath = path.join(PACKAGES_DIR, platformPkgDir);
	const platformPkgName = `@blazediff/${platformPkgDir}`;

	if (!fs.existsSync(platformPkgPath)) {
		console.error(`Platform package not found: ${platformPkgPath}`);
		process.exit(1);
	}

	// Create node_modules/@blazediff in bin package
	const binNodeModules = path.join(BIN_PKG_DIR, "node_modules", "@blazediff");
	fs.mkdirSync(binNodeModules, { recursive: true });

	// Link the platform package
	const linkPath = path.join(binNodeModules, platformPkgDir);

	try {
		ensureSymlink(platformPkgPath, linkPath);
		console.log(
			`Linked: ${platformPkgName} -> packages/bin/node_modules/@blazediff/${platformPkgDir}`,
		);
	} catch (err) {
		console.error(`Failed to link ${platformPkgName}: ${err.message}`);
		process.exit(1);
	}
}

main();
