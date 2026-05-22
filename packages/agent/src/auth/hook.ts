import path from "node:path";
import type { Page } from "playwright";
import type { CaptureAuth } from "../browser/capture";
import type { AgentAuthConfig } from "../types";
import { canonicalPersona } from "./env";
import { AuthHarnessError, loadAuthHarness, verifyPostLogin } from "./harness";

export class AuthConfigMissingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuthConfigMissingError";
	}
}

export function buildAuthHook(
	persona: string,
	authConfig: AgentAuthConfig | undefined,
	cwd: string,
): CaptureAuth {
	if (!authConfig) {
		throw new AuthConfigMissingError(
			"auth required but .blazediff/config.json has no `auth` block. Run `blazediff-agent auth init`.",
		);
	}
	const harnessFile = path.isAbsolute(authConfig.harness)
		? authConfig.harness
		: path.join(cwd, authConfig.harness);
	const canonical = canonicalPersona(persona);
	const loginUrl = authConfig.loginUrl;
	return {
		hook: async (page: Page) => {
			const mod = await loadAuthHarness(harnessFile);
			try {
				await mod.login(page, canonical);
			} catch (err) {
				throw new AuthHarnessError(
					`auth harness threw for persona "${canonical}": ${(err as Error).message}`,
					err,
				);
			}
			await verifyPostLogin(page, loginUrl);
		},
	};
}
