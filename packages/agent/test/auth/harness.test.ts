import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	_resetHarnessCache,
	AuthHarnessError,
	loadAuthHarness,
} from "../../src/auth/harness";

function startFixture(): Promise<{ server: Server; port: number }> {
	return new Promise((resolve) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const cookie = req.headers.cookie ?? "";
			if (url.pathname === "/login" && req.method === "GET") {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end(`<!DOCTYPE html><form method="POST" action="/login">
					<input name="email" type="email" />
					<input name="password" type="password" />
					<button type="submit">Sign in</button>
				</form>`);
				return;
			}
			if (url.pathname === "/login" && req.method === "POST") {
				let body = "";
				req.on("data", (c) => {
					body += c;
				});
				req.on("end", () => {
					const params = new URLSearchParams(body);
					const email = params.get("email");
					const password = params.get("password");
					if (email === "alice@example.com" && password === "hunter2") {
						res.statusCode = 302;
						res.setHeader("Set-Cookie", "session=ok; Path=/");
						res.setHeader("Location", "/protected");
						res.end();
						return;
					}
					res.statusCode = 302;
					res.setHeader("Location", "/login");
					res.end();
				});
				return;
			}
			if (url.pathname === "/protected") {
				if (!cookie.includes("session=ok")) {
					res.statusCode = 302;
					res.setHeader("Location", "/login");
					res.end();
					return;
				}
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end("<!DOCTYPE html><h1>Welcome</h1>");
				return;
			}
			res.statusCode = 404;
			res.end();
		});
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				resolve({ server, port: addr.port });
			}
		});
	});
}

let server: Server;
let port: number;
let tmp: string;
let baseUrl: string;

beforeAll(async () => {
	const f = await startFixture();
	server = f.server;
	port = f.port;
	baseUrl = `http://127.0.0.1:${port}`;
	tmp = await mkdtemp(path.join(tmpdir(), "blazediff-auth-"));
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	if (tmp) await rm(tmp, { recursive: true, force: true });
});

async function writeHarness(name: string, body: string): Promise<string> {
	const file = path.join(tmp, name);
	await writeFile(file, body, "utf8");
	_resetHarnessCache();
	return file;
}

describe("loadAuthHarness", () => {
	it("loads a harness module and returns its login function", async () => {
		const file = await writeHarness(
			"harness-ok.mjs",
			`export async function login(page, persona) { /* no-op */ }`,
		);
		const mod = await loadAuthHarness(file);
		expect(typeof mod.login).toBe("function");
	});

	it("errors clearly when the harness file is missing", async () => {
		await expect(
			loadAuthHarness(path.join(tmp, "does-not-exist.mjs")),
		).rejects.toThrow(/auth harness not found/);
	});

	it("errors when the harness does not export login", async () => {
		const file = await writeHarness("harness-bad.mjs", `export const foo = 1;`);
		await expect(loadAuthHarness(file)).rejects.toThrow(
			/does not export a `login` function/,
		);
	});
});

describe("verifyPostLogin (via fixture server)", () => {
	// Skip if Playwright Chromium isn't installed in CI; we attempt and fall
	// through with a clear message on platforms without it.
	let playwright: typeof import("playwright") | null = null;
	beforeAll(async () => {
		try {
			playwright = await import("playwright");
			await playwright.chromium
				.launch({ headless: true })
				.then((b) => b.close());
		} catch {
			playwright = null;
		}
	});

	it("runLogin succeeds end-to-end against the fixture", async () => {
		if (!playwright) {
			console.warn("playwright chromium unavailable; skipping integration");
			return;
		}
		const file = await writeHarness(
			"harness-good.mjs",
			`export async function login(page) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
				await page.locator('input[name=email]').fill('alice@example.com');
				await page.locator('input[name=password]').fill('hunter2');
				await Promise.all([
					page.waitForURL((url) => !url.pathname.startsWith('/login')),
					page.locator('button[type=submit]').click(),
				]);
			}`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			const { runLogin } = await import("../../src/auth/harness");
			await runLogin(page, "default", file, `${baseUrl}/login`);
			await page.goto(`${baseUrl}/protected`);
			const text = await page.locator("h1").innerText();
			expect(text).toBe("Welcome");
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);

	it("throws AuthHarnessError when the login URL still matches after harness", async () => {
		if (!playwright) {
			console.warn("playwright chromium unavailable; skipping integration");
			return;
		}
		const file = await writeHarness(
			"harness-wrongpw.mjs",
			`export async function login(page) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
				await page.locator('input[name=email]').fill('alice@example.com');
				await page.locator('input[name=password]').fill('wrong');
				await Promise.all([
					page.waitForURL(${JSON.stringify(`${baseUrl}/login`)}),
					page.locator('button[type=submit]').click(),
				]);
			}`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			const { runLogin } = await import("../../src/auth/harness");
			await expect(
				runLogin(page, "default", file, `${baseUrl}/login`),
			).rejects.toBeInstanceOf(AuthHarnessError);
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);

	it("throws AuthHarnessError when the harness leaves a password input visible", async () => {
		if (!playwright) {
			console.warn("playwright chromium unavailable; skipping integration");
			return;
		}
		const file = await writeHarness(
			"harness-no-submit.mjs",
			`export async function login(page) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
				/* never submits */
			}`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			const { runLogin } = await import("../../src/auth/harness");
			await expect(
				runLogin(page, "default", file, `${baseUrl}/login`),
			).rejects.toBeInstanceOf(AuthHarnessError);
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);
});
