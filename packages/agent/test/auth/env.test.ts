import { describe, expect, it } from "vitest";
import {
	canonicalPersona,
	envVarsForPersona,
	personasFromManifest,
	validatePersonas,
} from "../../src/auth/env";
import type { Manifest } from "../../src/types";

function entry(id: string, auth: null | string): Manifest["entries"][number] {
	return {
		id,
		url: "/x",
		viewport: { width: 1, height: 1 },
		auth,
		waitFor: [],
		mask: [],
		baselinePath: "",
		captureHash: "",
		createdBy: "agent",
		createdAt: "2026-01-01",
	};
}

describe("canonicalPersona", () => {
	it('maps the legacy "required" string to "default"', () => {
		expect(canonicalPersona("required")).toBe("default");
	});
	it("passes other strings through unchanged", () => {
		expect(canonicalPersona("admin")).toBe("admin");
	});
});

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

describe("personasFromManifest", () => {
	it("returns sorted unique personas, mapping legacy required to default", () => {
		const manifest: Manifest = {
			version: 1,
			configHash: "",
			stabilityHooksVersion: 1,
			entries: [
				entry("a", null),
				entry("b", "admin"),
				entry("c", "required"),
				entry("d", "admin"),
			],
		};
		expect(personasFromManifest(manifest)).toEqual(["admin", "default"]);
	});
});

describe("validatePersonas", () => {
	it("reports each missing env var per persona", () => {
		const missing = validatePersonas(["default", "admin"], {
			BLAZEDIFF_AUTH_DEFAULT_EMAIL: "x",
		});
		expect(missing).toEqual([
			{ persona: "default", vars: ["BLAZEDIFF_AUTH_DEFAULT_PASSWORD"] },
			{
				persona: "admin",
				vars: ["BLAZEDIFF_AUTH_ADMIN_EMAIL", "BLAZEDIFF_AUTH_ADMIN_PASSWORD"],
			},
		]);
	});

	it("returns empty when all env vars are set", () => {
		const missing = validatePersonas(["default"], {
			BLAZEDIFF_AUTH_DEFAULT_EMAIL: "a",
			BLAZEDIFF_AUTH_DEFAULT_PASSWORD: "b",
		});
		expect(missing).toEqual([]);
	});
});
