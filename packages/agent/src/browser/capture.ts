import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import {
	DEFAULT_FULL_PAGE,
	DEFAULT_VIEWPORT,
	DEFAULT_WAIT_FOR,
} from "../defaults";
import { HarnessError } from "../harness/loader";
import { paths } from "../paths";
import type { CaptureOptions, Harness, WaitFor } from "../types";
import {
	acquireStableContext,
	applyMaskOverlays,
	getBrowser,
	openStablePage,
	releaseStableContext,
	waitForStability,
} from "./launch";

export interface SubCapture {
	name: string;
	outputPath: string;
	bytes: number;
}

export interface CaptureResult {
	id: string;
	outputPath: string;
	mode: "baseline" | "actual";
	bytes: number;
	subCaptures?: SubCapture[];
}

/** A harness paired with the params to run it with, resolved by the caller. */
export interface ResolvedHarness {
	harness: Harness;
	params: Record<string, unknown>;
}

const SCREENSHOT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

async function shoot(
	page: Page,
	outputPath: string,
	fullPage: boolean,
): Promise<number> {
	await mkdir(path.dirname(outputPath), { recursive: true });
	const buffer = await page.screenshot({
		path: outputPath,
		type: "png",
		fullPage,
		animations: "disabled",
		caret: "hide",
		scale: "device",
	});
	return buffer.length;
}

async function stabilize(
	page: Page,
	waitFor: WaitFor[],
	masks: string[],
): Promise<void> {
	await waitForStability(page, waitFor);
	await applyMaskOverlays(page, masks);
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => r())),
	);
}

export async function captureScreenshot(
	baseUrl: string,
	opts: CaptureOptions,
	cwd: string = process.cwd(),
	harnesses?: ResolvedHarness[],
	signal?: AbortSignal,
): Promise<CaptureResult> {
	const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
	const waitFor = opts.waitFor ?? DEFAULT_WAIT_FOR;
	const masks = opts.mask ?? [];
	const fullPage = opts.fullPage ?? DEFAULT_FULL_PAGE;

	const setup = (harnesses ?? []).filter(
		(h) => (h.harness.phase ?? "interact") === "setup",
	);
	const interact = (harnesses ?? []).filter(
		(h) => (h.harness.phase ?? "interact") !== "setup",
	);

	// Harnesses mutate state (cookies for setup, DOM for interact), so they get a
	// disposable context rather than a pooled one.
	const handle = await acquireStableContext(viewport, {
		pool: !(harnesses && harnesses.length > 0),
		baseURL: baseUrl || undefined,
	});
	const context = handle.context;
	const browser = await getBrowser();
	const page = await openStablePage(handle);
	const abortCapture = () => {
		handle.disposable = true;
		void context.close().catch(() => {});
	};
	signal?.addEventListener("abort", abortCapture, { once: true });
	try {
		if (signal?.aborted) {
			abortCapture();
			throw signal.reason instanceof Error
				? signal.reason
				: new Error("capture aborted");
		}
		const rejectScreenshot = async (): Promise<void> => {
			throw new HarnessError("setup harness must not call screenshot()");
		};
		for (const { harness, params } of setup) {
			await harness.run({
				page,
				browser,
				context,
				params,
				screenshot: rejectScreenshot,
			});
		}

		const url = new URL(opts.url, baseUrl).toString();
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
		await stabilize(page, waitFor, masks);

		const outputDir =
			opts.mode === "baseline" ? paths(cwd).baselines : paths(cwd).actual;
		const outputPath = path.join(outputDir, `${opts.id}.png`);
		const bytes = await shoot(page, outputPath, fullPage);

		const subCaptures: SubCapture[] = [];
		const used = new Set<string>();
		const screenshot = async (name: string): Promise<void> => {
			if (!SCREENSHOT_NAME_RE.test(name)) {
				throw new HarnessError(
					`invalid screenshot name "${name}": use alphanumeric/kebab-case (no "__", spaces, or slashes)`,
				);
			}
			if (used.has(name)) {
				throw new HarnessError(`duplicate screenshot name "${name}"`);
			}
			used.add(name);
			await stabilize(page, waitFor, masks);
			const subPath = path.join(outputDir, `${opts.id}__${name}.png`);
			const subBytes = await shoot(page, subPath, fullPage);
			subCaptures.push({ name, outputPath: subPath, bytes: subBytes });
		};
		for (const { harness, params } of interact) {
			await harness.run({ page, browser, context, params, screenshot });
		}

		return {
			id: opts.id,
			outputPath,
			mode: opts.mode,
			bytes,
			subCaptures: subCaptures.length > 0 ? subCaptures : undefined,
		};
	} finally {
		signal?.removeEventListener("abort", abortCapture);
		await page.close().catch(() => {});
		await releaseStableContext(handle);
	}
}
