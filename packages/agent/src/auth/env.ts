export const DEFAULT_PERSONA = "default";

/**
 * Env var names a login harness reads for a persona. Used by `auth init` to
 * tell the user which vars to set; the harness itself reads them at runtime.
 */
export function envVarsForPersona(persona: string): {
	email: string;
	password: string;
} {
	const upper = persona.toUpperCase().replace(/[^A-Z0-9]/g, "_");
	return {
		email: `BLAZEDIFF_AUTH_${upper}_EMAIL`,
		password: `BLAZEDIFF_AUTH_${upper}_PASSWORD`,
	};
}
