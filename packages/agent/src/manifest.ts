import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	DEFAULT_FULL_PAGE,
	DEFAULT_VIEWPORT,
	DEFAULT_WAIT_FOR,
} from "./defaults";
import { paths } from "./paths";
import {
	type Manifest,
	type ManifestEntry,
	STABILITY_HOOKS_VERSION,
	type Viewport,
	type WaitFor,
} from "./types";

export interface EntryInput {
	id: string;
	url: string;
	viewport?: Viewport;
	mask?: string[];
	waitFor?: WaitFor[];
	fullPage?: boolean;
	auth?: null | "required";
	createdBy?: "agent" | "human";
}

interface HashInput {
	url: string;
	viewport: Viewport;
	mask: string[];
	waitFor: WaitFor[];
	auth: null | "required";
	fullPage: boolean;
}

export async function loadManifest(
	cwd: string = process.cwd(),
): Promise<Manifest | null> {
	const file = paths(cwd).manifest;
	if (!existsSync(file)) return null;
	return JSON.parse(await readFile(file, "utf8")) as Manifest;
}

export async function saveManifest(
	manifest: Manifest,
	cwd: string = process.cwd(),
): Promise<void> {
	const file = paths(cwd).manifest;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function emptyManifest(configHashValue: string): Manifest {
	return {
		version: 1,
		configHash: configHashValue,
		stabilityHooksVersion: STABILITY_HOOKS_VERSION,
		entries: [],
	};
}

function hashMaterial(input: HashInput): string {
	const material = {
		url: input.url,
		viewport: input.viewport,
		mask: [...input.mask].sort(),
		waitFor: input.waitFor,
		auth: input.auth,
		fullPage: input.fullPage,
		hooks: STABILITY_HOOKS_VERSION,
	};
	return `sha256:${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`;
}

export function makeEntry(input: EntryInput): ManifestEntry {
	const viewport = input.viewport ?? DEFAULT_VIEWPORT;
	const waitFor = input.waitFor ?? DEFAULT_WAIT_FOR;
	const mask = input.mask ?? [];
	const auth = input.auth ?? null;
	const fullPage = input.fullPage ?? DEFAULT_FULL_PAGE;
	return {
		id: input.id,
		url: input.url,
		viewport,
		auth,
		waitFor,
		mask,
		fullPage,
		baselinePath: path.posix.join(".blazediff", "baselines", `${input.id}.png`),
		captureHash: hashMaterial({
			url: input.url,
			viewport,
			mask,
			waitFor,
			auth,
			fullPage,
		}),
		createdBy: input.createdBy ?? "agent",
		createdAt: new Date().toISOString().slice(0, 10),
	};
}

export function addOrReplaceEntry(
	manifest: Manifest,
	entry: ManifestEntry,
): Manifest {
	const entries = [
		...manifest.entries.filter((e) => e.id !== entry.id),
		entry,
	].sort((a, b) => a.id.localeCompare(b.id));
	return { ...manifest, entries };
}

export function removeEntry(manifest: Manifest, id: string): Manifest {
	return { ...manifest, entries: manifest.entries.filter((e) => e.id !== id) };
}

export function findEntry(
	manifest: Manifest,
	id: string,
): ManifestEntry | undefined {
	return manifest.entries.find((e) => e.id === id);
}

export function isEntryStale(entry: ManifestEntry): boolean {
	const recomputed = hashMaterial({
		url: entry.url,
		viewport: entry.viewport,
		mask: entry.mask,
		waitFor: entry.waitFor,
		auth: entry.auth,
		fullPage: entry.fullPage ?? DEFAULT_FULL_PAGE,
	});
	return recomputed !== entry.captureHash;
}
