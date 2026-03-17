#!/usr/bin/env node
/**
 * Links the platform-specific blazediff-interpret binary to all packages that depend on @blazediff/interpret-native.
 * This is needed for local monorepo development since pnpm skips optional dependencies
 * that don't match the current platform.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");

const PLATFORM_MAP = {
	"darwin-arm64": "interpret-native-darwin-arm64",
	"darwin-x64": "interpret-native-darwin-x64",
	"linux-arm64": "interpret-native-linux-arm64",
	"linux-x64": "interpret-native-linux-x64",
	"win32-arm64": "interpret-native-win32-arm64",
	"win32-x64": "interpret-native-win32-x64",
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
	return os.platform() === "win32"
		? "blazediff-interpret.exe"
		: "blazediff-interpret";
}

function findPackagesWithBinDependency() {
	const packages = [];
	const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith("interpret-native-")) continue; // Skip platform packages

		const pkgJsonPath = path.join(PACKAGES_DIR, entry.name, "package.json");
		if (!fs.existsSync(pkgJsonPath)) continue;

		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
		const deps = {
			...pkgJson.dependencies,
			...pkgJson.devDependencies,
			...pkgJson.optionalDependencies,
		};

		if (deps["@blazediff/interpret-native"]) {
			packages.push(entry.name);
		}
	}

	return packages;
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
	const sourceBinary = path.join(PACKAGES_DIR, platformPkgDir, binaryName);

	if (!fs.existsSync(sourceBinary)) {
		console.log(
			`Binary not found: ${sourceBinary} (run 'pnpm build:rust:interpret' to build)`,
		);
		return;
	}

	const packagesToLink = findPackagesWithBinDependency();
	let linked = 0;

	for (const pkgName of packagesToLink) {
		const binDir = path.join(PACKAGES_DIR, pkgName, "node_modules", ".bin");

		if (!fs.existsSync(binDir)) {
			fs.mkdirSync(binDir, { recursive: true });
		}

		const linkPath = path.join(binDir, "blazediff-interpret");

		try {
			ensureSymlink(sourceBinary, linkPath);
			console.log(`Linked: ${pkgName}/node_modules/.bin/blazediff-interpret`);
			linked++;
		} catch (err) {
			console.error(`Failed to link in ${pkgName}: ${err.message}`);
		}
	}

	console.log(`\nLinked blazediff-interpret binary to ${linked} package(s)`);
}

main();
