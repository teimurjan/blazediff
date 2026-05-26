import { captureScreenshot, type ResolvedHarness } from "./browser/capture";
import { closeBrowser } from "./browser/launch";
import { configHash, loadConfig } from "./config";
import { defaultConcurrency } from "./defaults";
import { Semaphore } from "./graph/semaphore";
import { loadHarness, resolveHarnessFile } from "./harness/loader";
import {
	addOrReplaceEntry,
	emptyManifest,
	loadManifest,
	makeEntry,
	saveManifest,
} from "./manifest";
import type {
	AgentConfig,
	HarnessRef,
	Manifest,
	Viewport,
	WaitFor,
} from "./types";

export interface CaptureRouteInput {
	id: string;
	url: string;
	mask?: string[];
	viewport?: Viewport;
	waitFor?: WaitFor[];
	fullPage?: boolean;
	harnesses?: (string | HarnessRef)[];
	mode?: "baseline" | "actual";
}

export function normalizeHarnessRefs(
	refs: (string | HarnessRef)[] | undefined,
): HarnessRef[] {
	if (!refs) return [];
	return refs.map((ref) => (typeof ref === "string" ? { name: ref } : ref));
}

export async function resolveHarnesses(
	refs: HarnessRef[],
	cwd: string,
): Promise<ResolvedHarness[]> {
	return Promise.all(
		refs.map(async (ref) => ({
			harness: await loadHarness(resolveHarnessFile(ref.name, cwd)),
			params: ref.params ?? {},
		})),
	);
}

export interface RunCapturesOptions {
	baseUrl: string;
	routes: CaptureRouteInput[];
	mode?: "baseline" | "actual";
	writeManifest?: boolean;
	cwd?: string;
	concurrency?: number;
}

export interface CaptureRouteResult {
	id: string;
	url: string;
	mode: "baseline" | "actual";
	ok: boolean;
	outputPath?: string;
	bytes?: number;
	subCaptures?: string[];
	error?: string;
}

export interface RunCapturesReport {
	total: number;
	succeeded: number;
	failed: number;
	manifestUpdates: number;
	results: CaptureRouteResult[];
}

function validateRoute(route: CaptureRouteInput, i: number): string | null {
	if (!route || typeof route !== "object")
		return `route[${i}] must be an object`;
	if (!route.id || typeof route.id !== "string")
		return `route[${i}] missing id`;
	if (!route.url || typeof route.url !== "string")
		return `route[${i}] missing url`;
	return null;
}

async function loadOrCreateManifest(
	cwd: string,
	config: AgentConfig | null,
): Promise<Manifest> {
	const existing = await loadManifest(cwd);
	if (existing) return existing;
	return emptyManifest(config ? configHash(config) : "sha256:none");
}

export async function runCaptures(
	opts: RunCapturesOptions,
): Promise<RunCapturesReport> {
	const cwd = opts.cwd ?? process.cwd();
	const defaultMode = opts.mode ?? "baseline";
	const writeManifest = opts.writeManifest ?? true;

	const results: CaptureRouteResult[] = [];
	const valid: CaptureRouteInput[] = [];
	opts.routes.forEach((r, i) => {
		const err = validateRoute(r, i);
		if (err) {
			results.push({
				id: r?.id ?? `route[${i}]`,
				url: r?.url ?? "",
				mode: r?.mode ?? defaultMode,
				ok: false,
				error: err,
			});
		} else {
			valid.push(r);
		}
	});

	const config = await loadConfig(cwd);
	let manifest: Manifest | null = writeManifest
		? await loadOrCreateManifest(cwd, config)
		: null;
	let manifestUpdates = 0;

	// Parallel captures bounded by a Semaphore, mirroring the check flow.
	// Browser contexts are pooled per-viewport, so concurrent screenshots are
	// safe; results land in indexed slots to preserve input order.
	const slot: CaptureRouteResult[] = new Array(valid.length);
	const semaphore = new Semaphore(opts.concurrency ?? defaultConcurrency());

	try {
		await Promise.all(
			valid.map((r, i) =>
				semaphore.run(async () => {
					const mode = r.mode ?? defaultMode;
					try {
						const refs = normalizeHarnessRefs(r.harnesses);
						const harnesses = await resolveHarnesses(refs, cwd);
						const shot = await captureScreenshot(
							opts.baseUrl,
							{
								id: r.id,
								url: r.url,
								viewport: r.viewport,
								mask: r.mask,
								waitFor: r.waitFor,
								fullPage: r.fullPage,
								mode,
							},
							cwd,
							harnesses,
						);
						slot[i] = {
							id: r.id,
							url: r.url,
							mode,
							ok: true,
							outputPath: shot.outputPath,
							bytes: shot.bytes,
							subCaptures: shot.subCaptures?.map((s) => s.name),
						};
						if (mode === "baseline" && manifest) {
							const shared = {
								url: r.url,
								viewport: r.viewport,
								mask: r.mask,
								waitFor: r.waitFor,
								fullPage: r.fullPage,
								harnesses: refs.length > 0 ? refs : undefined,
							};
							// Drop any prior derived entries for this base so sub-shots the
							// harness no longer emits don't linger as orphans.
							manifest = {
								...manifest,
								entries: manifest.entries.filter((e) => e.parent !== r.id),
							};
							manifest = addOrReplaceEntry(
								manifest,
								makeEntry({ id: r.id, ...shared }),
							);
							manifestUpdates += 1;
							for (const sub of shot.subCaptures ?? []) {
								manifest = addOrReplaceEntry(
									manifest,
									makeEntry({
										id: `${r.id}__${sub.name}`,
										...shared,
										parent: r.id,
										derived: true,
										subName: sub.name,
									}),
								);
								manifestUpdates += 1;
							}
						}
					} catch (err) {
						slot[i] = {
							id: r.id,
							url: r.url,
							mode,
							ok: false,
							error: (err as Error).message,
						};
					}
				}),
			),
		);
		for (const r of slot) results.push(r);
		if (manifest && manifestUpdates > 0) await saveManifest(manifest, cwd);
	} finally {
		await closeBrowser();
	}

	const succeeded = results.filter((r) => r.ok).length;
	return {
		total: results.length,
		succeeded,
		failed: results.length - succeeded,
		manifestUpdates,
		results,
	};
}
