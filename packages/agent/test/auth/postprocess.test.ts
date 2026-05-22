import { describe, expect, it } from "vitest";
import { postprocessCodegen } from "../../src/auth/postprocess";

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

describe("postprocessCodegen", () => {
	it("rewrites attribute-selector fills to env-var references", () => {
		const result = postprocessCodegen(CODEGEN_ATTRIBUTE, {
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
		const result = postprocessCodegen(CODEGEN_GETBY, {
			persona: "admin",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.rewroteEmail).toBe(true);
		expect(result.rewrotePassword).toBe(true);
		expect(result.source).not.toContain("alice@example.com");
		expect(result.source).not.toContain("hunter2");
	});

	it("warns on positional selectors but still rewrites password", () => {
		const result = postprocessCodegen(CODEGEN_POSITIONAL, {
			persona: "default",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.warnings.join("\n")).toMatch(/positional selectors/);
		expect(result.rewrotePassword).toBe(true);
	});

	it("warns when no password field is detected", () => {
		const result = postprocessCodegen(CODEGEN_NO_PASSWORD, {
			persona: "default",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.rewrotePassword).toBe(false);
		expect(result.warnings.join("\n")).toMatch(/no password field detected/);
	});

	it("embeds the persona name into the generated harness default", () => {
		const result = postprocessCodegen(CODEGEN_ATTRIBUTE, {
			persona: "qa",
			loginUrl: "http://localhost:3000/login",
		});
		expect(result.source).toContain('persona = "qa"');
	});
});
