const KEY = "blazediff-auth-spa-example:auth";

export function isAuthed(): boolean {
	try {
		return globalThis.localStorage?.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

export function login(email: string, password: string): boolean {
	if (!email || !password) return false;
	globalThis.localStorage?.setItem(KEY, "1");
	return true;
}

export function logout(): void {
	globalThis.localStorage?.removeItem(KEY);
}
