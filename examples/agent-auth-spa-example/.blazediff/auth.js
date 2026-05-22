// Hand-authored login harness — matches the shape `blazediff-agent auth init`
// produces. Credentials live only in env vars; the file itself is safe to commit.

export async function login(page, persona = "default") {
	const upper = persona.toUpperCase().replace(/[^A-Z0-9]/g, "_");
	const email = process.env[`BLAZEDIFF_AUTH_${upper}_EMAIL`];
	const password = process.env[`BLAZEDIFF_AUTH_${upper}_PASSWORD`];
	if (!email || !password) {
		throw new Error(
			`missing BLAZEDIFF_AUTH_${upper}_EMAIL / _PASSWORD env vars for persona "${persona}"`,
		);
	}

	await page.goto("/login");
	await page.locator("input[name=email]").fill(email);
	await page.locator("input[name=password]").fill(password);
	await Promise.all([
		page.waitForURL((u) => !u.pathname.startsWith("/login")),
		page.locator("button[type=submit]").click(),
	]);
}
