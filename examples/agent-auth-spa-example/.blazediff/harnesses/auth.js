/** @type {import("@blazediff/agent").Harness<{ persona?: string }>} */
export default {
	phase: "setup", // runs before navigation; must NOT call screenshot()
	async run({ page, params }) {
		const upper = (params.persona ?? "default")
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "_");
		const email = process.env[`BLAZEDIFF_AUTH_${upper}_EMAIL`];
		const password = process.env[`BLAZEDIFF_AUTH_${upper}_PASSWORD`];
		if (!email || !password) {
			throw new Error(`missing BLAZEDIFF_AUTH_${upper}_EMAIL / _PASSWORD`);
		}

		await page.goto("http://127.0.0.1:5173/login");
		await page.locator('input[name="email"]').fill(email);
		await page.locator('input[name="password"]').fill(password);
		await Promise.all([
			page.waitForURL((u) => !u.pathname.startsWith("/login")),
			page.getByRole("button", { name: /sign in/i }).click(),
		]);

		if (new URL(page.url()).pathname.startsWith("/login")) {
			throw new Error("login did not leave /login — check selectors/redirect");
		}
	},
};
