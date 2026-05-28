import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { paths } from "../paths";
import type { Harness } from "../types";

export class HarnessError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = "HarnessError";
	}
}

const moduleCache = new Map<string, Promise<Harness>>();

/**
 * Resolve a harness reference to an absolute file path. A bare `name` resolves
 * to `.blazediff/harnesses/<name>.js` (preferring `.mjs` if present); an
 * explicit relative/absolute path is honored as-is.
 */
export function resolveHarnessFile(name: string, cwd: string): string {
	if (name.includes("/") || name.includes("\\") || path.isAbsolute(name)) {
		return path.isAbsolute(name) ? name : path.resolve(cwd, name);
	}
	const dir = paths(cwd).harnesses;
	const mjs = path.join(dir, `${name}.mjs`);
	if (existsSync(mjs)) return mjs;
	return path.join(dir, `${name}.js`);
}

/**
 * Load a harness module. Harnesses are ESM `.js`/`.mjs` files that
 * default-export a {@link Harness}. The module is cached by absolute path.
 */
export async function loadHarness(harnessFile: string): Promise<Harness> {
	const absolute = path.isAbsolute(harnessFile)
		? harnessFile
		: path.resolve(process.cwd(), harnessFile);
	if (!existsSync(absolute)) {
		throw new HarnessError(
			`harness not found at ${absolute}. Author one under .blazediff/harnesses/ (or run \`blazediff-agent harness record <name>\` to record one).`,
		);
	}
	const cached = moduleCache.get(absolute);
	if (cached) return cached;
	const url = pathToFileURL(absolute).href;
	const loading = (async () => {
		let mod: Record<string, unknown>;
		try {
			// Fully-dynamic runtime path (a user-authored harness); keep bundlers
			// and vitest's SSR runner from trying to resolve it at analysis time.
			mod = (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
		} catch (err) {
			throw new HarnessError(
				`failed to load harness at ${absolute}: ${(err as Error).message}`,
				err,
			);
		}
		const harness = mod.default as Partial<Harness> | undefined;
		if (!harness || typeof harness.run !== "function") {
			if (typeof mod.login === "function") {
				throw new HarnessError(
					`legacy auth harness detected at ${absolute} (exports \`login\`). Re-run \`blazediff-agent harness record auth --login\` to regenerate it as a harness.`,
				);
			}
			throw new HarnessError(
				`harness at ${absolute} must default-export an object with a \`run(ctx)\` function`,
			);
		}
		return { phase: harness.phase ?? "interact", run: harness.run };
	})();
	moduleCache.set(absolute, loading);
	return loading;
}

export function _resetHarnessCache(): void {
	moduleCache.clear();
}

function loginPathOf(loginUrl: string): string {
	try {
		return new URL(loginUrl, "http://placeholder").pathname;
	} catch {
		return loginUrl;
	}
}

/**
 * Safety check for login harnesses: confirms the page left the login URL and no
 * visible password input remains. Exported so generated auth harnesses can call
 * it without the framework special-casing auth.
 */
export async function assertLeftLoginPage(
	page: Page,
	loginUrl: string,
): Promise<void> {
	const loginPath = loginPathOf(loginUrl);
	let currentPath: string;
	try {
		currentPath = new URL(page.url()).pathname;
	} catch {
		currentPath = page.url();
	}
	if (loginPath && currentPath === loginPath) {
		throw new HarnessError(
			`login harness returned but page is still on the login URL (${currentPath}). Check that the harness submits the form and waits for redirect.`,
		);
	}
	// SPAs may keep the login form mounted for a tick after navigation while the
	// router unmounts it; wait briefly for the password input to detach.
	await page
		.locator('input[type="password"]')
		.first()
		.waitFor({ state: "detached", timeout: 2_000 })
		.catch(() => {});
	const passwordInputs = await page
		.locator('input[type="password"]:visible')
		.count()
		.catch(() => 0);
	if (passwordInputs > 0) {
		throw new HarnessError(
			`login harness returned but a visible password input is still on the page. The login likely did not complete (wrong credentials, captcha, or selectors out of date).`,
		);
	}
}
