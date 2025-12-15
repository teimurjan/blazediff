const fs = require("fs");
const path = require("path");
const os = require("os");

const binaries = {
	"linux-x64": "blazediff-linux-x64",
	"linux-arm64": "blazediff-linux-arm64",
	"darwin-arm64": "blazediff-macos-arm64",
	"darwin-x64": "blazediff-macos-x64",
	"win32-x64": "blazediff-windows-x64.exe",
	"win32-arm64": "blazediff-windows-arm64.exe",
};

const platform = os.platform();
const arch = os.arch();

const binaryKey = `${platform}-${arch}`;
const binaryFile = binaries[binaryKey];

if (!binaryFile) {
	console.error(
		`blazediff: Sorry your platform or architecture is not supported. Supported: ${Object.keys(binaries).join(", ")}`,
	);
	process.exit(1);
}

const sourcePath = path.join(__dirname, "binaries", binaryFile);
const binDir = path.join(__dirname, "bin");
const destPath = path.join(binDir, "blazediff.exe");

try {
	if (!fs.existsSync(binDir)) {
		fs.mkdirSync(binDir, { recursive: true });
	}
	fs.copyFileSync(sourcePath, destPath);
	fs.chmodSync(destPath, 0o755);
} catch (err) {
	console.error(`blazediff: failed to copy and link the binary file: ${err}`);
	process.exit(1);
}
