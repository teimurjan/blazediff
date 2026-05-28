import { access, readFile } from "node:fs/promises";

/** True iff `p` exists and is readable by the current process. */
export async function fileExists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

/**
 * Parse JSON from `file`, returning `null` for any failure (missing file, bad
 * permissions, malformed JSON). Use when "absent" and "corrupt" should collapse
 * into the same recovery path — most call sites here treat both as "no prior
 * data, start fresh".
 */
export async function readJsonOrNull<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch {
		return null;
	}
}
