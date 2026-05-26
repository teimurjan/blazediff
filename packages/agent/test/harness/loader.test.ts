import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	_resetHarnessCache,
	assertLeftLoginPage,
	HarnessError,
	loadHarness,
} from "../../src/harness/loader";

let tmp: string;

beforeAll(async () => {
	tmp = await mkdtemp(path.join(tmpdir(), "blazediff-harness-"));
});

afterAll(async () => {
	if (tmp) await rm(tmp, { recursive: true, force: true });
});

async function writeHarness(name: string, body: string): Promise<string> {
	const file = path.join(tmp, name);
	await writeFile(file, body, "utf8");
	_resetHarnessCache();
	return file;
}

describe("loadHarness", () => {
	it("loads a default-exported harness and defaults phase to interact", async () => {
		const file = await writeHarness(
			"ok.mjs",
			`export default { async run() {} };`,
		);
		const harness = await loadHarness(file);
		expect(typeof harness.run).toBe("function");
		expect(harness.phase).toBe("interact");
	});

	it("preserves an explicit setup phase", async () => {
		const file = await writeHarness(
			"setup.mjs",
			`export default { phase: "setup", async run() {} };`,
		);
		expect((await loadHarness(file)).phase).toBe("setup");
	});

	it("errors when the harness file is missing", async () => {
		await expect(loadHarness(path.join(tmp, "nope.mjs"))).rejects.toThrow(
			/harness not found/,
		);
	});

	it("errors when there is no default run export", async () => {
		const file = await writeHarness("bad.mjs", `export const foo = 1;`);
		await expect(loadHarness(file)).rejects.toThrow(
			/must default-export an object with a `run/,
		);
	});

	it("flags a legacy auth harness exporting login", async () => {
		const file = await writeHarness(
			"legacy.mjs",
			`export async function login(page) {}`,
		);
		await expect(loadHarness(file)).rejects.toThrow(/legacy auth harness/);
	});
});

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
					if (
						params.get("email") === "alice@example.com" &&
						params.get("password") === "hunter2"
					) {
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
			if (addr && typeof addr === "object")
				resolve({ server, port: addr.port });
		});
	});
}

describe("login harness end-to-end (via fixture server)", () => {
	let server: Server;
	let baseUrl: string;
	let playwright: typeof import("playwright") | null = null;

	beforeAll(async () => {
		const f = await startFixture();
		server = f.server;
		baseUrl = `http://127.0.0.1:${f.port}`;
		try {
			playwright = await import("playwright");
			await playwright.chromium
				.launch({ headless: true })
				.then((b) => b.close());
		} catch {
			playwright = null;
		}
	});

	afterAll(async () => {
		if (server) await new Promise<void>((r) => server.close(() => r()));
	});

	async function runLogin(file: string, page: Page): Promise<void> {
		const harness = await loadHarness(file);
		const browser = page.context().browser();
		if (!browser) throw new Error("no browser on page context");
		await harness.run({
			page,
			browser,
			context: page.context(),
			params: { persona: "default" },
			screenshot: async () => {},
		});
		await assertLeftLoginPage(page, `${baseUrl}/login`);
	}

	it("succeeds end-to-end against the fixture", async () => {
		if (!playwright) return;
		const file = await writeHarness(
			"good.mjs",
			`export default { phase: "setup", async run({ page }) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
				await page.locator('input[name=email]').fill('alice@example.com');
				await page.locator('input[name=password]').fill('hunter2');
				await Promise.all([
					page.waitForURL((url) => !url.pathname.startsWith('/login')),
					page.locator('button[type=submit]').click(),
				]);
			} };`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await runLogin(file, page);
			await page.goto(`${baseUrl}/protected`);
			expect(await page.locator("h1").innerText()).toBe("Welcome");
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);

	it("throws when the page is still on the login URL after the harness", async () => {
		if (!playwright) return;
		const file = await writeHarness(
			"wrongpw.mjs",
			`export default { phase: "setup", async run({ page }) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
				await page.locator('input[name=email]').fill('alice@example.com');
				await page.locator('input[name=password]').fill('wrong');
				await Promise.all([
					page.waitForURL(${JSON.stringify(`${baseUrl}/login`)}),
					page.locator('button[type=submit]').click(),
				]);
			} };`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await expect(runLogin(file, page)).rejects.toBeInstanceOf(HarnessError);
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);

	it("throws when a visible password input remains", async () => {
		if (!playwright) return;
		const file = await writeHarness(
			"no-submit.mjs",
			`export default { phase: "setup", async run({ page }) {
				await page.goto(${JSON.stringify(`${baseUrl}/login`)});
			} };`,
		);
		const browser = await playwright.chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await expect(runLogin(file, page)).rejects.toBeInstanceOf(HarnessError);
		} finally {
			await context.close();
			await browser.close();
		}
	}, 30_000);
});
