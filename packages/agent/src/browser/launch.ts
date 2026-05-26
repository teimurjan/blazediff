import {
	type Browser,
	type BrowserContext,
	chromium,
	type Page,
} from "playwright";
import type { Viewport, WaitFor } from "../types";

const FROZEN_NOW = Date.UTC(2025, 0, 1, 0, 0, 0);

const STABILITY_CSS = `
*,*::before,*::after{
	animation-delay:-0.0001s !important;
	animation-duration:0s !important;
	animation-iteration-count:1 !important;
	transition-delay:0s !important;
	transition-duration:0s !important;
	caret-color:transparent !important;
}
html{scroll-behavior:auto !important}
`;

const CHROMIUM_FLAGS = [
	"--font-render-hinting=none",
	"--disable-skia-runtime-opts",
	"--force-color-profile=srgb",
	"--disable-lcd-text",
	"--disable-background-timer-throttling",
	"--disable-renderer-backgrounding",
	"--disable-backgrounding-occluded-windows",
	"--hide-scrollbars",
];

let cachedBrowser: Browser | null = null;
let launchInFlight: Promise<Browser> | null = null;
const contextPool = new Map<string, BrowserContext[]>();

export async function getBrowser(): Promise<Browser> {
	if (cachedBrowser?.isConnected()) return cachedBrowser;
	if (launchInFlight) return launchInFlight;
	launchInFlight = chromium
		.launch({ headless: true, args: CHROMIUM_FLAGS })
		.then((b) => {
			cachedBrowser = b;
			return b;
		})
		.finally(() => {
			launchInFlight = null;
		});
	return launchInFlight;
}

export async function closeBrowser(): Promise<void> {
	if (launchInFlight) {
		await launchInFlight.catch(() => {});
	}
	const ctxs = Array.from(contextPool.values()).flat();
	contextPool.clear();
	await Promise.all(ctxs.map((c) => c.close().catch(() => {})));
	if (!cachedBrowser) return;
	await cachedBrowser.close().catch(() => {});
	cachedBrowser = null;
}

function viewportKey(v: Viewport): string {
	return `${v.width}x${v.height}`;
}

async function createStableContext(
	viewport: Viewport,
	baseURL?: string,
): Promise<BrowserContext> {
	const browser = await getBrowser();
	const context = await browser.newContext({
		viewport,
		deviceScaleFactor: 1,
		reducedMotion: "reduce",
		forcedColors: "none",
		colorScheme: "light",
		bypassCSP: true,
		baseURL,
	});

	await context.addInitScript(
		({ frozenNow }) => {
			Object.defineProperty(Date, "now", {
				value: () => frozenNow,
				writable: true,
				configurable: true,
			});
			let perfTick = 0;
			Object.defineProperty(performance, "now", {
				value: () => {
					perfTick += 16.6667;
					return perfTick;
				},
				writable: true,
				configurable: true,
			});
			let seed = 0x9e3779b9 | 0;
			Math.random = () => {
				seed = (seed + 0x6d2b79f5) | 0;
				let t = seed;
				t = Math.imul(t ^ (t >>> 15), t | 1);
				t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
			if (typeof crypto !== "undefined") {
				let uuidCounter = 0;
				Object.defineProperty(crypto, "randomUUID", {
					value: () => {
						uuidCounter += 1;
						return `00000000-0000-4000-8000-${uuidCounter.toString(16).padStart(12, "0")}`;
					},
					writable: true,
					configurable: true,
				});
			}
		},
		{ frozenNow: FROZEN_NOW },
	);

	return context;
}

export interface StableContextHandle {
	context: BrowserContext;
	viewport: Viewport;
	disposable: boolean;
}

export interface AcquireStableContextOptions {
	pool?: boolean;
	baseURL?: string;
}

export async function acquireStableContext(
	viewport: Viewport,
	options: AcquireStableContextOptions = {},
): Promise<StableContextHandle> {
	const usePool = options.pool !== false;
	const key = viewportKey(viewport);
	if (usePool) {
		const pool = contextPool.get(key);
		if (pool && pool.length > 0) {
			const context = pool.pop() as BrowserContext;
			return { context, viewport, disposable: false };
		}
	}
	const context = await createStableContext(viewport, options.baseURL);
	return { context, viewport, disposable: !usePool };
}

export async function releaseStableContext(
	handle: StableContextHandle,
): Promise<void> {
	if (handle.disposable || !cachedBrowser?.isConnected()) {
		await handle.context.close().catch(() => {});
		return;
	}
	const key = viewportKey(handle.viewport);
	const pool = contextPool.get(key);
	if (pool) {
		pool.push(handle.context);
	} else {
		contextPool.set(key, [handle.context]);
	}
}

export async function openStablePage(
	handle: StableContextHandle,
): Promise<Page> {
	const page = await handle.context.newPage();
	const injectStability = () =>
		page.addStyleTag({ content: STABILITY_CSS }).catch(() => {});
	await injectStability();
	page.on("load", injectStability);
	return page;
}

export async function waitForStability(
	page: Page,
	waitFor: WaitFor[],
): Promise<void> {
	for (const w of waitFor) {
		if (w === "networkidle") {
			await page.waitForLoadState("networkidle").catch(() => {});
		} else if (w === "fonts") {
			await page
				.evaluate(() =>
					document.fonts && "ready" in document.fonts
						? document.fonts.ready.then(() => undefined)
						: undefined,
				)
				.catch(() => {});
		} else {
			await page
				.waitForSelector(w.selector, { timeout: w.timeoutMs ?? 5_000 })
				.catch(() => {});
		}
	}
}

export const DEFAULT_MASK_ATTR = "data-blazediff-agent-mask";
const DEFAULT_MASK_SELECTOR = `[${DEFAULT_MASK_ATTR}]`;

export async function applyMaskOverlays(
	page: Page,
	masks: string[],
): Promise<void> {
	const selectors = [DEFAULT_MASK_SELECTOR, ...masks];
	await page.evaluate((selectors) => {
		// Clear overlays from a prior shot so re-masking after a harness
		// interaction reflects the current DOM rather than stale positions.
		for (const stale of Array.from(
			document.querySelectorAll("[data-blazediff-mask]"),
		)) {
			stale.remove();
		}
		for (const sel of selectors) {
			for (const el of Array.from(
				document.querySelectorAll<HTMLElement>(sel),
			)) {
				const rect = el.getBoundingClientRect();
				const overlay = document.createElement("div");
				overlay.style.position = "absolute";
				overlay.style.left = `${rect.left + window.scrollX}px`;
				overlay.style.top = `${rect.top + window.scrollY}px`;
				overlay.style.width = `${rect.width}px`;
				overlay.style.height = `${rect.height}px`;
				overlay.style.background = "#ff00ff";
				overlay.style.zIndex = "2147483647";
				overlay.style.pointerEvents = "none";
				overlay.setAttribute("data-blazediff-mask", "1");
				document.body.appendChild(overlay);
			}
		}
	}, selectors);
}
