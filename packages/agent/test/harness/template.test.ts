import { describe, expect, it } from "vitest";
import { buildHarness, buildLoginHarness } from "../../src/harness/template";

const CODEGEN_ATTRIBUTE = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="email"]').click();
  await page.locator('input[name="email"]').fill('alice@example.com');
  await page.locator('input[name="password"]').fill('hunter2');
  await page.getByRole('button', { name: 'Sign in' }).click();
});
`;

const CODEGEN_GETBY = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Password').fill('hunter2');
  await page.getByRole('button', { name: 'Log in' }).click();
});
`;

const CODEGEN_POSITIONAL = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.locator('body > div > form > input:nth-child(1)').fill('alice@example.com');
  await page.locator('body > div > form > input[type="password"]').fill('hunter2');
  await page.locator('button').click();
});
`;

const CODEGEN_NO_PASSWORD = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/start');
  await page.locator('a').click();
});
`;

const CODEGEN_INTERACT = `import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/weather');
  await page.getByRole('button', { name: 'Open menu' }).click();
});
`;

describe("buildLoginHarness", () => {
	it("rewrites attribute-selector fills to env-var references", () => {
		const result = buildLoginHarness(CODEGEN_ATTRIBUTE, {
			name: "auth",
			persona: "default",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.rewroteEmail).toBe(true);
		expect(result.rewrotePassword).toBe(true);
		expect(result.source).not.toContain("alice@example.com");
		expect(result.source).not.toContain("hunter2");
		expect(result.source).toContain(".fill(email)");
		expect(result.source).toContain(".fill(password)");
		expect(result.source).toContain("BLAZEDIFF_AUTH_${upper}_EMAIL");
	});

	it("rewrites getByLabel-based codegen output", () => {
		const result = buildLoginHarness(CODEGEN_GETBY, {
			name: "auth",
			persona: "admin",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.rewroteEmail).toBe(true);
		expect(result.rewrotePassword).toBe(true);
		expect(result.source).not.toContain("alice@example.com");
		expect(result.source).not.toContain("hunter2");
	});

	it("warns on positional selectors but still rewrites password", () => {
		const result = buildLoginHarness(CODEGEN_POSITIONAL, {
			name: "auth",
			persona: "default",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.warnings.join("\n")).toMatch(/positional selectors/);
		expect(result.rewrotePassword).toBe(true);
	});

	it("warns when no password field is detected", () => {
		const result = buildLoginHarness(CODEGEN_NO_PASSWORD, {
			name: "auth",
			persona: "default",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.rewrotePassword).toBe(false);
		expect(result.warnings.join("\n")).toMatch(/no password field detected/);
	});

	it("generates a default-exported setup harness with the persona fallback", () => {
		const result = buildLoginHarness(CODEGEN_ATTRIBUTE, {
			name: "auth",
			persona: "qa",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.source).toContain("export default {");
		expect(result.source).toContain('phase: "setup"');
		expect(result.source).toContain('params.persona ?? "qa"');
	});
});

describe("buildHarness", () => {
	it("wraps the recorded body in a phased harness and keeps the actions verbatim", () => {
		const result = buildHarness(CODEGEN_INTERACT, {
			name: "weather-menu",
			url: "http://localhost:3000/weather",
			phase: "interact",
		});
		expect(result.source).toContain("export default {");
		expect(result.source).toContain('phase: "interact"');
		expect(result.source).toContain(
			'await page.goto("http://localhost:3000/weather")',
		);
		expect(result.source).toContain("Open menu");
		// Generic harnesses never touch credentials.
		expect(result.source).not.toContain("BLAZEDIFF_AUTH");
		expect(result.warnings).toHaveLength(0);
	});

	it("drops the leading goto from the recording so navigation is explicit", () => {
		const result = buildHarness(CODEGEN_INTERACT, {
			name: "weather-menu",
			url: "http://localhost:3000/elsewhere",
			phase: "interact",
		});
		// Only the harness's own goto remains, not the recorded one.
		expect(result.source.match(/page\.goto\(/g)).toHaveLength(1);
		expect(result.source).toContain(
			'page.goto("http://localhost:3000/elsewhere")',
		);
	});
});
