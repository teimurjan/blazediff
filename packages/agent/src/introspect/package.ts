import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PORT } from "../defaults";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface DevScriptCandidate {
	name: string;
	body: string;
	command: string;
	port: number;
}

export interface PackageInfo {
	packageManager: PackageManager;
	devScript: string;
	devCommand: string;
	port: number;
	candidates: DevScriptCandidate[];
	devDependencies: Record<string, string>;
	dependencies: Record<string, string>;
	allDependencies: Record<string, string>;
}

export async function readPackageJson(
	cwd: string = process.cwd(),
): Promise<Record<string, unknown> | null> {
	const file = path.join(cwd, "package.json");
	if (!existsSync(file)) return null;
	return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

export function detectPackageManager(
	cwd: string = process.cwd(),
): PackageManager {
	let dir = cwd;
	const { root } = path.parse(dir);
	while (true) {
		if (existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
		if (
			existsSync(path.join(dir, "bun.lockb")) ||
			existsSync(path.join(dir, "bun.lock"))
		)
			return "bun";
		if (existsSync(path.join(dir, "yarn.lock"))) return "yarn";
		if (existsSync(path.join(dir, "package-lock.json"))) return "npm";
		if (dir === root) return "npm";
		dir = path.dirname(dir);
	}
}

const DEFAULT_PORTS: Record<string, number> = {
	next: 3000,
	"react-scripts": 3000,
	vite: 5173,
	remix: 3000,
	"@remix-run/dev": 3000,
	astro: 4321,
	svelte: 5173,
	vue: 5173,
	nuxt: 3000,
	gatsby: 8000,
	parcel: 1234,
};

const DEV_SCRIPT_CANDIDATES = ["dev", "start", "serve", "develop"];

function inferPort(script: string, deps: Record<string, string>): number {
	const portArg = script.match(/(?:--port[\s=]|-p\s+)(\d+)/);
	if (portArg) return Number(portArg[1]);
	const portEnv = script.match(/PORT[\s=]+(\d+)/);
	if (portEnv) return Number(portEnv[1]);
	const depNames = Object.keys(deps);
	for (const [pkg, port] of Object.entries(DEFAULT_PORTS)) {
		if (depNames.some((d) => d.startsWith(pkg))) return port;
	}
	return DEFAULT_PORT;
}

function runnerFor(pm: PackageManager, scriptName: string): string {
	if (pm === "npm") return `npm run ${scriptName}`;
	if (pm === "yarn") return `yarn ${scriptName}`;
	if (pm === "bun") return `bun run ${scriptName}`;
	return `pnpm ${scriptName}`;
}

function collectCandidates(
	scripts: Record<string, string>,
	deps: Record<string, string>,
	pm: PackageManager,
): DevScriptCandidate[] {
	const out: DevScriptCandidate[] = [];
	for (const name of DEV_SCRIPT_CANDIDATES) {
		if (scripts[name]) {
			out.push({
				name,
				body: scripts[name],
				command: runnerFor(pm, name),
				port: inferPort(scripts[name], deps),
			});
		}
	}
	return out;
}

export async function introspectPackage(
	cwd: string = process.cwd(),
): Promise<PackageInfo | null> {
	const pkg = await readPackageJson(cwd);
	if (!pkg) return null;
	const packageManager = detectPackageManager(cwd);
	const scripts = (pkg.scripts ?? {}) as Record<string, string>;
	const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>;
	const dependencies = (pkg.dependencies ?? {}) as Record<string, string>;
	const allDependencies = { ...devDependencies, ...dependencies };
	const candidates = collectCandidates(
		scripts,
		allDependencies,
		packageManager,
	);
	if (!candidates.length) return null;
	const chosen = candidates[0];
	return {
		packageManager,
		devScript: chosen.name,
		devCommand: chosen.command,
		port: chosen.port,
		candidates,
		devDependencies,
		dependencies,
		allDependencies,
	};
}
