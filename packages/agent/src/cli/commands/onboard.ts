import type { Command } from "commander";
import { closeBrowser } from "../../browser/launch";
import { installBrowsers } from "../../browsers";
import { type CaptureRouteInput, runCaptures } from "../../captures";
import { loadConfig, saveConfig } from "../../config";
import { DEFAULT_READY_TIMEOUT_MS } from "../../defaults";
import { discover } from "../../discover";
import type { JudgeBackend } from "../../judge";
import {
	type ConfigOpts,
	configSummary,
	ensureConfig,
	NO_DEV_SCRIPT_ERROR,
} from "../../onboard/config";
import { type InstallResult, installStack } from "../../onboard/install";
import {
	CODING_AGENT_STACKS,
	detectStacks,
	parseStackList,
	STACKS,
	type Stack,
} from "../../onboard/stacks";
import { isPortOpen, startServer, stopServer } from "../../server/lifecycle";
import type { AgentConfig, DiscoveredRoute } from "../../types";
import type { Output } from "../output";
import { promptChoice, promptYesNo } from "../prompt";

interface Opts extends ConfigOpts {
	stack?: string;
	force?: boolean;
	browsers?: boolean; // --no-browsers => false
	capture?: boolean; // --no-capture => false
	yes?: boolean;
}

interface CaptureSummary {
	captured: number;
	routes: number;
}

async function promptForStacks(): Promise<Stack[]> {
	const choices = [
		...CODING_AGENT_STACKS.map((id) => ({
			label: STACKS[id].label,
			value: [id] as Stack[],
			hint: STACKS[id].target?.(process.cwd()) ?? "",
		})),
		{ label: "All three coding agents", value: [...CODING_AGENT_STACKS] },
		{
			label: STACKS.local.label,
			value: ["local"] as Stack[],
			hint: "local judge, no coding agent",
		},
	];
	return promptChoice("Which coding agent(s) do you use?", choices);
}

/**
 * Resolve which playbook stacks to install. Explicit `--stack` wins; otherwise
 * auto-detect, prompt on a TTY, or — in non-interactive runs with nothing
 * detected — return `[]` so onboard still does config + chromium (it's the
 * scriptable config path), skipping the playbook with a note.
 */
async function resolveStacks(
	opts: Opts,
	interactive: boolean,
): Promise<Stack[]> {
	if (opts.stack) return parseStackList(opts.stack);
	const detected = detectStacks(process.cwd());
	if (detected.length > 0) return detected;
	if (interactive) return promptForStacks();
	return [];
}

/** Ensure Chromium is present; install (prompting on TTY) unless skipped. */
async function ensureBrowsers(
	opts: Opts,
	interactive: boolean,
): Promise<{ installed: boolean; skipped: boolean }> {
	const status = await installBrowsers({ check: true });
	if (status.installed) return { installed: true, skipped: false };

	const shouldInstall =
		opts.yes ||
		!interactive ||
		(await promptYesNo("Chromium is not installed. Install it now?", true));
	if (!shouldInstall) return { installed: false, skipped: true };

	const result = await installBrowsers();
	return { installed: result.installed, skipped: false };
}

function routeId(path: string): string {
	const slug = path
		.replace(/^\/+|\/+$/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "home";
}

function toCaptureRoutes(routes: DiscoveredRoute[]): CaptureRouteInput[] {
	const seen = new Set<string>();
	const out: CaptureRouteInput[] = [];
	for (const r of routes) {
		if (r.auth) continue; // auth-gated routes need a harness; skip in quick capture
		let id = routeId(new URL(r.url, "http://x").pathname);
		while (seen.has(id)) id = `${id}-2`;
		seen.add(id);
		out.push({ id, url: r.url });
	}
	return out;
}

/** Discover routes and capture baselines, managing the dev server lifecycle. */
async function captureBaselines(
	config: AgentConfig,
	baseUrl: string,
): Promise<CaptureSummary> {
	const cwd = process.cwd();
	const port = config.devServer?.port;
	let startedByUs = false;

	if (config.devServer && port && !(await isPortOpen(port))) {
		await startServer({
			command: config.devServer.command,
			port,
			readyTimeoutMs:
				config.devServer.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
		});
		startedByUs = true;
	}

	try {
		const discovered = await discover({ baseUrl });
		const routes = toCaptureRoutes(discovered);
		if (routes.length === 0) return { captured: 0, routes: 0 };

		const report = await runCaptures({
			baseUrl,
			routes,
			mode: "baseline",
			writeManifest: true,
		});
		return { captured: report.succeeded, routes: routes.length };
	} finally {
		await closeBrowser();
		if (startedByUs && port) await stopServer(cwd, port);
	}
}

/** Persist the judge backend implied by the onboarded stack(s). */
async function persistJudge(judge: JudgeBackend, cwd: string): Promise<void> {
	const existing = await loadConfig(cwd);
	const config: AgentConfig = { ...(existing ?? { devServer: null }), judge };
	await saveConfig(config, cwd);
}

function suggestOtherStacks(installed: Stack[]): string {
	// Don't nag about coding agents when the user opted into the local judge.
	if (installed.includes("local")) return "";
	const missing = CODING_AGENT_STACKS.filter((s) => !installed.includes(s));
	if (missing.length === 0) return "";
	const labels = missing.map((s) => STACKS[s].label).join(" / ");
	return `  also use ${labels}? run: blazediff-agent onboard --stack ${missing.join(",")}`;
}

function humanizeInstall(results: InstallResult[]): string[] {
	return results.map((r) => {
		const info = STACKS[r.stack];
		if (r.status === "configured") {
			return `  ${info.label}: configured local judge (models download on first check)`;
		}
		const verb =
			r.status === "created"
				? "wrote"
				: r.status === "updated"
					? "updated"
					: r.status === "unchanged"
						? "unchanged"
						: "skipped (exists; --force to overwrite)";
		const scope = info.scope === "user" ? " [user-global]" : "";
		return `  ${info.label}: ${verb} ${r.path}${scope}`;
	});
}

export function registerOnboard(program: Command, out: Output): void {
	program
		.command("onboard")
		.description(
			"interactive setup: write .blazediff/config.json, install Chromium, install the BlazeDiff playbook for your stack (Claude Code / Codex / Cursor, or --stack local for a Moondream + Qwen judge), and optionally capture baselines.",
		)
		.option(
			"--stack <list>",
			'comma-separated stack ids, or "all". valid: claude,codex,cursor,all,local (local cannot be combined)',
		)
		.option("--force", "overwrite existing config and playbook files")
		.option(
			"--url <baseUrl>",
			"point at an already-running server / external URL",
		)
		.option("--dev-command <cmd>", "override detected dev-server command")
		.option("--port <n>", "override detected port")
		.option(
			"--dev-script <name>",
			"select a dev script by name when multiple candidates exist",
		)
		.option("--no-browsers", "skip the Chromium install step")
		.option("--no-capture", "skip the baseline-capture step")
		.option("--yes", "accept all prompts (capture baselines, install Chromium)")
		.action(async (opts: Opts) => {
			const cwd = process.cwd();
			const interactive = out.isTTY() && !out.isJson();
			const lines: string[] = [];

			// 1. Config — tolerant: a tool-only install (no dev script, no --url)
			// still installs the playbook + chromium.
			let config: AgentConfig | null = null;
			let created = false;
			try {
				const res = await ensureConfig(opts, out);
				config = res.config;
				created = res.created;
				lines.push(
					created
						? `wrote ${configSummary(config)}`
						: `config exists: ${configSummary(config)} (--force to rewrite)`,
				);
			} catch (err) {
				if (err instanceof Error && err.message === NO_DEV_SCRIPT_ERROR) {
					lines.push(
						"config: skipped (no dev script detected; pass --url or --dev-command)",
					);
				} else {
					throw err;
				}
			}

			// 2. Chromium
			let chromium: { installed: boolean; skipped: boolean } = {
				installed: true,
				skipped: true,
			};
			if (opts.browsers === false) {
				lines.push("chromium: skipped (--no-browsers)");
			} else {
				chromium = await ensureBrowsers(opts, interactive);
				lines.push(
					chromium.installed
						? "chromium ready"
						: "chromium not installed (capture/check will fail until `blazediff-agent browsers install`)",
				);
			}

			// 3. Playbook + judge
			const targets = await resolveStacks(opts, interactive);
			const installed: InstallResult[] = [];
			for (const t of targets) {
				installed.push(await installStack(t, cwd, { force: opts.force }));
			}
			let judge: JudgeBackend = config?.judge ?? "host";
			if (targets.length === 0) {
				lines.push(
					"playbook: no coding-agent stack detected (pass --stack <claude|codex|cursor|all|local> to install)",
				);
			} else {
				judge = targets.includes("local") ? "local" : "host";
				await persistJudge(judge, cwd);
				lines.push("playbook:");
				lines.push(...humanizeInstall(installed));
				lines.push(suggestOtherStacks(installed.map((r) => r.stack)));
			}

			// 4. Capture baselines (interactive offer / --yes)
			let capture: CaptureSummary | null = null;
			const canCapture =
				opts.capture !== false &&
				chromium.installed &&
				Boolean(config?.baseUrl);
			const wantCapture =
				canCapture &&
				(opts.yes ||
					(interactive &&
						(await promptYesNo(
							"Discover routes & capture baselines now?",
							true,
						))));
			if (wantCapture && config?.baseUrl) {
				capture = await captureBaselines(config, config.baseUrl);
				lines.push(
					capture.captured > 0
						? `captured ${capture.captured}/${capture.routes} baselines`
						: "no routes discovered — capture manually with `capture --stdin --mode baseline`",
				);
			}

			// 5. Next-step hint
			lines.push(
				capture && capture.captured > 0
					? "→ next: blazediff-agent check"
					: "→ next: blazediff-agent discover | capture --stdin --mode baseline",
			);

			out.emit(
				{
					ok: true,
					created,
					config,
					chromium,
					detected: detectStacks(cwd),
					judge,
					installed,
					captured: capture,
				},
				lines.filter(Boolean).join("\n"),
			);
		});
}
