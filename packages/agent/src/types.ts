import type { BoundingBox } from "@blazediff/core-native";
import type { Browser, BrowserContext, Page } from "playwright";
import type { Verdict } from "./diff/verdict";
import type { JudgeBackend } from "./judge/types";

export const STABILITY_HOOKS_VERSION = 1;

/**
 * Context handed to a harness. `params` is intentionally generic — a harness
 * author types it to whatever the harness needs (e.g. `{ persona: string }`
 * for a login harness). `screenshot(name)` emits a named sub-screenshot that
 * becomes its own baseline entry (`<entryId>__<name>`).
 */
export interface HarnessContext<P = Record<string, unknown>> {
	page: Page;
	browser: Browser;
	context: BrowserContext;
	params: P;
	screenshot(name: string): Promise<void>;
}

/**
 * A pluggable script run before/around a screenshot. `setup` harnesses run
 * before navigation (establish session, e.g. login); `interact` harnesses run
 * after the base screenshot and may drive the page + emit named screenshots.
 */
export interface Harness<P = Record<string, unknown>> {
	phase?: "setup" | "interact";
	run(ctx: HarnessContext<P>): Promise<void>;
}

/** Per-entry reference to a harness file under `.blazediff/harnesses/<name>.js`. */
export interface HarnessRef {
	name: string;
	params?: Record<string, unknown>;
}

export interface RegionSummary {
	bbox: BoundingBox;
	pixelCount: number;
	percentage: number;
	changeType: string;
	confidence: number;
}

export interface Viewport {
	width: number;
	height: number;
}

export interface WaitForSelector {
	selector: string;
	timeoutMs?: number;
}

export type WaitFor = "networkidle" | "fonts" | WaitForSelector;

export interface ManifestEntry {
	id: string;
	url: string;
	viewport: Viewport;
	harnesses?: HarnessRef[];
	waitFor: WaitFor[];
	mask: string[];
	fullPage?: boolean;
	/** Set on sub-entries produced by a harness `screenshot(name)` call. */
	parent?: string;
	derived?: boolean;
	baselinePath: string;
	captureHash: string;
	createdBy: "agent" | "human";
	createdAt: string;
}

export interface Manifest {
	version: 1;
	configHash: string;
	stabilityHooksVersion: number;
	entries: ManifestEntry[];
}

export interface DevServerConfig {
	command: string;
	port: number;
	cwd?: string;
	readyTimeoutMs?: number;
}

/** Route-discovery tuning, honored by both `discover` and `onboard` captures. */
export interface DiscoveryConfig {
	/** cap on routes returned (default 50) */
	maxRoutes?: number;
	/**
	 * Collapse large list/detail template groups (e.g. /blog/:slug) down to a
	 * few representatives. Set `false` for content sites where sibling routes are
	 * distinct pages you want fully covered (default true).
	 */
	sampleTemplates?: boolean;
	/** representatives kept per sampled group (default 2) */
	samplesPerTemplate?: number;
	/** group size at which sampling kicks in (default 5) */
	sampleThreshold?: number;
}

export interface AgentConfig {
	devServer: DevServerConfig | null;
	framework?: string;
	packageManager?: "npm" | "pnpm" | "yarn" | "bun";
	baseUrl?: string;
	/** default judge backend for `check`, set by `onboard --stack` */
	judge?: JudgeBackend;
	/** route-discovery tuning for `discover` and `onboard` captures */
	discovery?: DiscoveryConfig;
}

export interface CaptureOptions {
	id: string;
	url: string;
	viewport?: Viewport;
	mask?: string[];
	waitFor?: WaitFor[];
	fullPage?: boolean;
	mode: "baseline" | "actual";
}

export interface DiscoveredRoute {
	url: string;
	source: "crawl";
	auth?: string;
}

export interface CheckReport {
	createdAt: string;
	totalEntries: number;
	passed: number;
	failed: number;
	pendingJudgments: number;
	results: CheckResult[];
}

export interface CheckResult {
	id: string;
	url: string;
	status:
		| "pass"
		| "fail"
		| "missing-baseline"
		| "stale-baseline"
		| "needs-judgment";
	diffCount?: number;
	diffPercentage?: number;
	severity?: string;
	regions?: RegionSummary[];
	/** Natural pixel dimensions of the compared image (for region overlay scaling). */
	width?: number;
	height?: number;
	verdict?: Verdict;
	diffPath?: string;
	actualPath?: string;
	baselinePath?: string;
	message?: string;
	/** Human decision recorded by `review` (re-baselined or confirmed regression). */
	review?: "approved" | "rejected";
}
