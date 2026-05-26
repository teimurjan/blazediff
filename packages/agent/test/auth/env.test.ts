import { describe, expect, it } from "vitest";
import { envVarsForPersona } from "../../src/auth/env";

describe("envVarsForPersona", () => {
	it("uppercases the persona and uses the BLAZEDIFF_AUTH_ prefix", () => {
		expect(envVarsForPersona("default")).toEqual({
			email: "BLAZEDIFF_AUTH_DEFAULT_EMAIL",
			password: "BLAZEDIFF_AUTH_DEFAULT_PASSWORD",
		});
	});
	it("replaces non-alphanumeric chars with underscores", () => {
		expect(envVarsForPersona("qa-admin")).toEqual({
			email: "BLAZEDIFF_AUTH_QA_ADMIN_EMAIL",
			password: "BLAZEDIFF_AUTH_QA_ADMIN_PASSWORD",
		});
	});
});
