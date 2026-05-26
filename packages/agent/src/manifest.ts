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
	type HarnessRef,
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
	harnesses?: HarnessRef[];
	parent?: string;
	derived?: boolean;
	subName?: string;
	createdBy?: "agent" | "human";
}

interface HashInput {
	url: string;
	viewport: Viewport;
	mask: string[];
	waitFor: WaitFor[];
	harnesses: HarnessRef[];
	fullPage: boolean;
	subName?: string;
}

// Serialize harness refs for hashing. Harness *order* is significant (setup
// before interact, and array order within a phase), so it's preserved — only
// each ref's params object is key-sorted for stability.
function serializeHarnesses(harnesses: HarnessRef[]): string {
	return JSON.stringify(
		harnesses.map((h) => ({
			name: h.name,
			params: h.params
				? Object.fromEntries(
						Object.entries(h.params).sort(([a], [b]) => a.localeCompare(b)),
					)
				: undefined,
		})),
	);
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
		harnesses: serializeHarnesses(input.harnesses),
		fullPage: input.fullPage,
		subName: input.subName ?? null,
		hooks: STABILITY_HOOKS_VERSION,
	};
	return `sha256:${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`;
}

export function makeEntry(input: EntryInput): ManifestEntry {
	const viewport = input.viewport ?? DEFAULT_VIEWPORT;
	const waitFor = input.waitFor ?? DEFAULT_WAIT_FOR;
	const mask = input.mask ?? [];
	const harnesses = input.harnesses ?? [];
	const fullPage = input.fullPage ?? DEFAULT_FULL_PAGE;
	return {
		id: input.id,
		url: input.url,
		viewport,
		harnesses: harnesses.length > 0 ? harnesses : undefined,
		waitFor,
		mask,
		fullPage,
		parent: input.parent,
		derived: input.derived || undefined,
		baselinePath: path.posix.join(".blazediff", "baselines", `${input.id}.png`),
		captureHash: hashMaterial({
			url: input.url,
			viewport,
			mask,
			waitFor,
			harnesses,
			fullPage,
			subName: input.subName,
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

export function isDerived(entry: ManifestEntry): boolean {
	return (
		entry.derived === true || (entry.parent != null && entry.id.includes("__"))
	);
}

/** The sub-screenshot name encoded in a derived entry id (`parent__name`). */
export function subNameOf(entry: ManifestEntry): string | undefined {
	if (!isDerived(entry)) return undefined;
	const idx = entry.id.indexOf("__");
	return idx === -1 ? undefined : entry.id.slice(idx + 2);
}

export function childrenOf(
	manifest: Manifest,
	parentId: string,
): ManifestEntry[] {
	return manifest.entries.filter((e) => e.parent === parentId);
}

/** Derived entries whose parent base entry no longer exists in the manifest. */
export function findOrphanedSubEntries(manifest: Manifest): ManifestEntry[] {
	const ids = new Set(manifest.entries.map((e) => e.id));
	return manifest.entries.filter(
		(e) => isDerived(e) && e.parent != null && !ids.has(e.parent),
	);
}

export function isEntryStale(entry: ManifestEntry): boolean {
	const recomputed = hashMaterial({
		url: entry.url,
		viewport: entry.viewport,
		mask: entry.mask,
		waitFor: entry.waitFor,
		harnesses: entry.harnesses ?? [],
		fullPage: entry.fullPage ?? DEFAULT_FULL_PAGE,
		subName: subNameOf(entry),
	});
	return recomputed !== entry.captureHash;
}
