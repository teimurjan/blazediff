#!/usr/bin/env node
/**
 * Links the platform-specific blazediff binary to all packages that depend on @blazediff/core-native.
 * This is needed for local monorepo development since pnpm skips optional dependencies
 * that don't match the current platform.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");

const PLATFORM_MAP = {
	"darwin-arm64": "core-native-darwin-arm64",
	"darwin-x64": "core-native-darwin-x64",
	"linux-arm64": "core-native-linux-arm64",
	"linux-x64": "core-native-linux-x64",
	"win32-arm64": "core-native-win32-arm64",
	"win32-x64": "core-native-win32-x64",
};

function getPlatformPackageDir() {
	const key = `${os.platform()}-${os.arch()}`;
	const pkgDir = PLATFORM_MAP[key];
	if (!pkgDir) {
		console.error(`Unsupported platform: ${key}`);
		process.exit(1);
	}
	return pkgDir;
}

function getBinaryName() {
	return os.platform() === "win32" ? "blazediff.exe" : "blazediff";
}

/**
 * Every package directory under packages/, relative to it. The native families
 * are nested one level deeper (packages/<family>/<package>), so a directory
 * without its own package.json is descended into rather than skipped.
 */
function packageDirs(relative = "", depth = 2) {
	return fs
		.readdirSync(path.join(PACKAGES_DIR, relative), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
		.flatMap((entry) => {
			const dir = path.join(relative, entry.name);
			if (fs.existsSync(path.join(PACKAGES_DIR, dir, "package.json")))
				return [dir];
			return depth > 1 ? packageDirs(dir, depth - 1) : [];
		});
}

function findPackagesWithBinDependency() {
	return packageDirs().filter((dir) => {
		// Skip the platform packages themselves — they ship the binary.
		if (path.basename(dir).startsWith("core-native-")) return false;

		const pkgJson = JSON.parse(
			fs.readFileSync(path.join(PACKAGES_DIR, dir, "package.json"), "utf8"),
		);
		const deps = {
			...pkgJson.dependencies,
			...pkgJson.devDependencies,
			...pkgJson.optionalDependencies,
		};
		return Boolean(deps["@blazediff/core-native"]);
	});
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
	const binaryName = getBinaryName();
	const sourceBinary = path.join(
		PACKAGES_DIR,
		"core-native",
		platformPkgDir,
		binaryName,
	);

	if (!fs.existsSync(sourceBinary)) {
		console.error(`Binary not found: ${sourceBinary}`);
		console.error("Run 'pnpm build:rust:native' first to build the binary.");
		process.exit(1);
	}

	const packagesToLink = findPackagesWithBinDependency();
	let linked = 0;

	for (const pkgName of packagesToLink) {
		const binDir = path.join(PACKAGES_DIR, pkgName, "node_modules", ".bin");

		if (!fs.existsSync(binDir)) {
			fs.mkdirSync(binDir, { recursive: true });
		}

		const linkPath = path.join(binDir, "blazediff");

		try {
			ensureSymlink(sourceBinary, linkPath);
			console.log(`Linked: ${pkgName}/node_modules/.bin/blazediff`);
			linked++;
		} catch (err) {
			console.error(`Failed to link in ${pkgName}: ${err.message}`);
		}
	}

	console.log(`\nLinked blazediff binary to ${linked} package(s)`);
}

main();
