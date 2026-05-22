import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { paths } from "../paths";
import { canonicalPersona } from "./env";

export class AuthHarnessError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = "AuthHarnessError";
	}
}

export interface AuthHarnessModule {
	login: (page: Page, persona: string) => Promise<void>;
}

const moduleCache = new Map<string, Promise<AuthHarnessModule>>();

export function harnessPath(cwd: string = process.cwd()): string {
	return path.join(paths(cwd).root, "auth.js");
}

export async function loadAuthHarness(
	harnessFile: string,
): Promise<AuthHarnessModule> {
	const absolute = path.isAbsolute(harnessFile)
		? harnessFile
		: path.resolve(process.cwd(), harnessFile);
	if (!existsSync(absolute)) {
		throw new AuthHarnessError(
			`auth harness not found at ${absolute}. Run \`blazediff-agent auth init\` to create one.`,
		);
	}
	const cached = moduleCache.get(absolute);
	if (cached) return cached;
	const url = pathToFileURL(absolute).href;
	const loading = (async () => {
		try {
			const mod = (await import(url)) as Partial<AuthHarnessModule>;
			if (typeof mod.login !== "function") {
				throw new AuthHarnessError(
					`auth harness at ${absolute} does not export a \`login\` function`,
				);
			}
			return { login: mod.login };
		} catch (err) {
			if (err instanceof AuthHarnessError) throw err;
			throw new AuthHarnessError(
				`failed to load auth harness at ${absolute}: ${(err as Error).message}`,
				err,
			);
		}
	})();
	moduleCache.set(absolute, loading);
	return loading;
}

function loginPathOf(loginUrl: string): string {
	try {
		return new URL(loginUrl, "http://placeholder").pathname;
	} catch {
		return loginUrl;
	}
}

export async function verifyPostLogin(
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
		throw new AuthHarnessError(
			`auth harness returned but page is still on the login URL (${currentPath}). Check that the harness submits the form and waits for redirect.`,
		);
	}
	// SPAs may keep the login form mounted for a tick after navigation while
	// the router unmounts it; wait briefly for the password input to detach
	// before declaring failure.
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
		throw new AuthHarnessError(
			`auth harness returned but a visible password input is still on the page. The login likely did not complete (wrong credentials, captcha, or selectors out of date).`,
		);
	}
}

export async function runLogin(
	page: Page,
	persona: string,
	harnessFile: string,
	loginUrl: string,
): Promise<void> {
	const mod = await loadAuthHarness(harnessFile);
	const canonical = canonicalPersona(persona);
	try {
		await mod.login(page, canonical);
	} catch (err) {
		throw new AuthHarnessError(
			`auth harness threw for persona "${canonical}": ${(err as Error).message}`,
			err,
		);
	}
	await verifyPostLogin(page, loginUrl);
}

export function _resetHarnessCache(): void {
	moduleCache.clear();
}
