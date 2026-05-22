import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import {
	DEFAULT_FULL_PAGE,
	DEFAULT_VIEWPORT,
	DEFAULT_WAIT_FOR,
} from "../defaults";
import { paths } from "../paths";
import type { CaptureOptions } from "../types";
import {
	acquireStableContext,
	applyMaskOverlays,
	openStablePage,
	releaseStableContext,
	waitForStability,
} from "./launch";

export interface CaptureResult {
	id: string;
	outputPath: string;
	mode: "baseline" | "actual";
	bytes: number;
}

export interface CaptureAuth {
	hook: (page: Page) => Promise<void>;
}

export async function captureScreenshot(
	baseUrl: string,
	opts: CaptureOptions,
	cwd: string = process.cwd(),
	auth?: CaptureAuth,
): Promise<CaptureResult> {
	const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
	const waitFor = opts.waitFor ?? DEFAULT_WAIT_FOR;
	const masks = opts.mask ?? [];
	const fullPage = opts.fullPage ?? DEFAULT_FULL_PAGE;

	const handle = await acquireStableContext(viewport, {
		pool: !auth,
		baseURL: baseUrl || undefined,
	});
	const page = await openStablePage(handle);
	try {
		if (auth) {
			await auth.hook(page);
		}
		const url = new URL(opts.url, baseUrl).toString();
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
		await waitForStability(page, waitFor);
		await applyMaskOverlays(page, masks);
		await page.evaluate(
			() => new Promise<void>((r) => requestAnimationFrame(() => r())),
		);

		const outputDir =
			opts.mode === "baseline" ? paths(cwd).baselines : paths(cwd).actual;
		await mkdir(outputDir, { recursive: true });
		const outputPath = path.join(outputDir, `${opts.id}.png`);
		const buffer = await page.screenshot({
			path: outputPath,
			type: "png",
			fullPage,
			animations: "disabled",
			caret: "hide",
			scale: "device",
		});

		return { id: opts.id, outputPath, mode: opts.mode, bytes: buffer.length };
	} finally {
		await page.close().catch(() => {});
		await releaseStableContext(handle);
	}
}
