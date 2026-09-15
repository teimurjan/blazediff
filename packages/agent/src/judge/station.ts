/**
 * Moondream Station lifecycle — the inference backend behind `--judge moondream`.
 *
 * Station runs Moondream on Apple Silicon's GPU (Metal kernels); onnxruntime-node
 * has no working GPU path for this model, so the fast local judge hosts the
 * weights in Station and reads them over localhost instead of in-process. This
 * module owns that process end to end: install it if missing, attach to a
 * running one or launch our own, put it on the MLX model, warm it, and stop
 * whatever it started when the CLI exits.
 *
 * Station's only control surface is an interactive REPL, so settings and model
 * switches are typed into its stdin; readiness, the active model and the applied
 * timeout are read back from its REST API rather than by scraping that output.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { bold, dim, pc } from "../cli/render/theme";
import { stopProcess } from "../server/lifecycle";

const execFileP = promisify(execFile);

const PORT = 2020;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const COMMAND = "moondream-station";
/**
 * Station's MLX build: the Metal-native path on Apple Silicon, and the reason
 * this judge exists. Its `moondream-2` build is a PyTorch backend pinned only to
 * `transformers>=4.56.1`, which resolves to 5.x and dies on the model's remote
 * code (`'HfMoondream' object has no attribute 'all_tied_weights_keys'`), so it
 * is not a usable fallback today.
 */
const MODEL = "moondream-3-preview-mlx-quantized";
/** Station defaults to 30s, which trips on the first query of a cold model. */
const MIN_INFERENCE_TIMEOUT_S = 900;
const READY_TIMEOUT_MS = 120_000;
const SETTINGS_TIMEOUT_MS = 30_000;
/** A first switch downloads several GB of weights. */
const MODEL_TIMEOUT_MS = 900_000;
const POLL_INTERVAL_MS = 500;
const OUTPUT_TAIL_LINES = 15;
/** 1x1 white PNG: enough to make Station load the model before real reads. */
const WARMUP_IMAGE =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR42mP4//8/AAX+Av4zEpUUAAAAAElFTkSuQmCC";

export interface StationHandle {
	/** Inference API base, e.g. `http://127.0.0.1:2020/v1`. */
	endpoint: string;
	model: string;
	/** True when a Station was already running: we use it and leave it alone. */
	attached: boolean;
	stop(): Promise<void>;
}

interface StationStats {
	model?: string;
	status?: string;
	default_timeout?: number;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const note = (message: string): void => {
	process.stderr.write(`${dim("[blazediff]")} ${message}\n`);
};

async function readStats(): Promise<StationStats | null> {
	try {
		const response = await fetch(`${BASE_URL}/v1/stats`, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok ? ((await response.json()) as StationStats) : null;
	} catch {
		return null;
	}
}

async function waitForStats(
	predicate: (stats: StationStats) => boolean,
	timeoutMs: number,
	what: string,
	tail: string[],
): Promise<StationStats> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const stats = await readStats();
		if (stats && predicate(stats)) return stats;
		await sleep(POLL_INTERVAL_MS);
	}
	const context = tail.length > 0 ? `\n${tail.join("\n")}` : "";
	throw new Error(`moondream station: timed out waiting for ${what}${context}`);
}

async function commandExists(command: string): Promise<boolean> {
	try {
		await execFileP(process.platform === "win32" ? "where" : "which", [
			command,
		]);
		return true;
	} catch {
		return false;
	}
}

function ensureApplePlatform(): void {
	if (process.platform === "darwin" && process.arch === "arm64") return;
	throw new Error(
		"the moondream judge needs Apple Silicon (moondream station's Metal build). Use --judge local for the in-process ONNX judge.",
	);
}

async function ensureInstalled(): Promise<void> {
	if (await commandExists(COMMAND)) return;
	if (!(await commandExists("uv"))) {
		throw new Error(
			`moondream station is not installed. Install uv (https://docs.astral.sh/uv) and retry, or install it yourself: pipx install ${COMMAND}`,
		);
	}
	note(`installing ${bold(COMMAND)} ${dim("(one time)")}`);
	await execFileP("uv", ["tool", "install", COMMAND]);
}

interface Launched {
	child: ChildProcess;
	/** Last lines of Station's output, for error context when it never comes up. */
	tail: string[];
}

function launch(): Launched {
	const tail: string[] = [];
	// Detached so Station leads its own process group: it spawns the inference
	// worker as a child, and only a group signal takes both down.
	const child = spawn(COMMAND, {
		stdio: ["pipe", "pipe", "pipe"],
		detached: true,
		env: { ...process.env, NO_COLOR: "1" },
	});

	const remember = (chunk: Buffer): void => {
		for (const line of chunk.toString().split("\n")) {
			const text = line.trim();
			if (!text) continue;
			tail.push(text);
			if (tail.length > OUTPUT_TAIL_LINES) tail.shift();
		}
	};
	child.stdout?.on("data", remember);
	child.stderr?.on("data", remember);
	child.once("error", (error: Error) => tail.push(error.message));

	// First run prompts for a HuggingFace token; an empty line skips it.
	child.stdin?.write("\n");
	return { child, tail };
}

const send = (child: ChildProcess, command: string): void => {
	child.stdin?.write(`${command}\n`);
};

async function ensureTimeout(
	child: ChildProcess,
	tail: string[],
): Promise<void> {
	const stats = await readStats();
	if ((stats?.default_timeout ?? 0) >= MIN_INFERENCE_TIMEOUT_S) return;
	send(child, `settings set inference_timeout ${MIN_INFERENCE_TIMEOUT_S}`);
	await waitForStats(
		(s) => (s.default_timeout ?? 0) >= MIN_INFERENCE_TIMEOUT_S,
		SETTINGS_TIMEOUT_MS,
		"the inference timeout to apply",
		tail,
	);
}

async function ensureModel(
	child: ChildProcess,
	active: string | undefined,
	tail: string[],
): Promise<void> {
	if (active === MODEL) return;
	note(
		`switching moondream station to ${bold(MODEL)} ${dim("(first run downloads weights)")}`,
	);
	// `y` answers the disk/RAM confirmation shown the first time a model installs.
	send(child, `models switch ${MODEL}`);
	send(child, "y");
	await waitForStats(
		(s) => s.model === MODEL && s.status === "running",
		MODEL_TIMEOUT_MS,
		`moondream station to load ${MODEL}`,
		tail,
	);
}

/**
 * Station loads weights on its first query, not at startup. Spend that here so
 * it lands in the judge's warmup phase instead of stalling the first judgment.
 */
async function warmModel(endpoint: string): Promise<void> {
	const response = await fetch(`${endpoint}/query`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			image_url: WARMUP_IMAGE,
			question: "Read the text in this image.",
			stream: false,
		}),
		signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
	});
	const payload = (await response.json()) as { error?: string };
	if (payload.error) throw new Error(`moondream station: ${payload.error}`);
}

/**
 * Station outlives us otherwise: it is a child, not a process group, and nothing
 * in the judge interface runs at the end of a check. Signal handlers must exit
 * themselves — registering one suppresses Node's default termination.
 */
function killOnExit(child: ChildProcess): void {
	const kill = (): void => {
		if (!child.pid) return;
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			/* already gone */
		}
	};
	process.once("exit", kill);
	process.once("SIGINT", () => {
		kill();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		kill();
		process.exit(143);
	});
}

async function start(): Promise<StationHandle> {
	const endpoint = `${BASE_URL}/v1`;

	const running = await readStats();
	if (running) {
		await warmModel(endpoint);
		return {
			endpoint,
			model: running.model ?? "unknown",
			attached: true,
			stop: async () => {},
		};
	}

	ensureApplePlatform();
	await ensureInstalled();
	const { child, tail } = launch();

	try {
		const stats = await waitForStats(
			() => true,
			READY_TIMEOUT_MS,
			"moondream station to start",
			tail,
		);
		await ensureTimeout(child, tail);
		await ensureModel(child, stats.model, tail);
		await warmModel(endpoint);
		killOnExit(child);
		note(`moondream station ready ${pc.green("✓")} ${dim(endpoint)}`);
		return {
			endpoint,
			model: MODEL,
			attached: false,
			stop: async () => {
				if (child.pid) await stopProcess(child.pid);
			},
		};
	} catch (error) {
		if (child.pid) await stopProcess(child.pid);
		throw error;
	}
}

let station: Promise<StationHandle> | undefined;

/** Start (or join) the one Station this process uses. */
export function startStation(): Promise<StationHandle> {
	station ??= start();
	return station;
}
