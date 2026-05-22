import type { Manifest } from "../types";

export const LEGACY_REQUIRED = "required";
export const DEFAULT_PERSONA = "default";

export function canonicalPersona(auth: string): string {
	return auth === LEGACY_REQUIRED ? DEFAULT_PERSONA : auth;
}

export function envVarsForPersona(persona: string): {
	email: string;
	password: string;
} {
	const upper = canonicalPersona(persona)
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "_");
	return {
		email: `BLAZEDIFF_AUTH_${upper}_EMAIL`,
		password: `BLAZEDIFF_AUTH_${upper}_PASSWORD`,
	};
}

export function personasFromManifest(manifest: Manifest): string[] {
	const set = new Set<string>();
	for (const entry of manifest.entries) {
		if (entry.auth !== null) set.add(canonicalPersona(entry.auth));
	}
	return Array.from(set).sort();
}

export interface MissingEnv {
	persona: string;
	vars: string[];
}

export function validatePersonas(
	personas: string[],
	env: NodeJS.ProcessEnv = process.env,
): MissingEnv[] {
	const missing: MissingEnv[] = [];
	for (const persona of personas) {
		const { email, password } = envVarsForPersona(persona);
		const vars: string[] = [];
		if (!env[email]) vars.push(email);
		if (!env[password]) vars.push(password);
		if (vars.length > 0) missing.push({ persona, vars });
	}
	return missing;
}

export function formatMissingEnv(missing: MissingEnv[]): string {
	const lines = missing.map(
		(m) => `  persona "${m.persona}": missing ${m.vars.join(", ")}`,
	);
	return [
		`auth env vars missing for ${missing.length} persona(s):`,
		...lines,
		"  set them and re-run, or run `blazediff-agent auth init` to record a harness",
	].join("\n");
}
