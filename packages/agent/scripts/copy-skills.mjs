// Mirrors the repo's skill sources into the package so they ship in the npm
// tarball. Symlinks would be simpler but do not survive `npm pack` — a link
// escaping the package root is dropped on extract — so this copies.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageDir, "..", "..", "skill");
const destination = join(packageDir, "skills");

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

for (const skill of readdirSync(source, { withFileTypes: true })) {
	if (!skill.isDirectory()) continue;
	cpSync(join(source, skill.name), join(destination, skill.name), {
		recursive: true,
		// INSTALL.md is for humans installing the CLI, not part of the playbook.
		filter: (path) => !path.endsWith("INSTALL.md"),
	});
}
