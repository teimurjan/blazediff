import type { ChangeRegion } from "@blazediff/core-native";
import type { Verdict } from "./diff/verdict";

export const STABILITY_HOOKS_VERSION = 1;

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
	auth: null | "required";
	waitFor: WaitFor[];
	mask: string[];
	fullPage?: boolean;
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

export interface AgentConfig {
	devServer: DevServerConfig | null;
	framework?: string;
	packageManager?: "npm" | "pnpm" | "yarn" | "bun";
	baseUrl?: string;
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
	source: "next-manifest" | "sitemap" | "crawl";
	auth?: "required";
}

export interface CheckReport {
	createdAt: string;
	totalEntries: number;
	passed: number;
	failed: number;
	results: CheckResult[];
}

export interface CheckResult {
	id: string;
	url: string;
	status: "pass" | "fail" | "missing-baseline" | "stale-baseline";
	diffCount?: number;
	diffPercentage?: number;
	severity?: string;
	regions?: ChangeRegion[];
	verdict?: Verdict;
	diffPath?: string;
	actualPath?: string;
	baselinePath?: string;
	message?: string;
}
