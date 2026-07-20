/**
 * Shared dynamic loader for `@huggingface/transformers`.
 *
 * It is an optional peer dependency, imported lazily so coding-agent stacks
 * never pay for the ONNX runtime + weights. Both local-judge runners (the
 * Moondream vision describer and the Qwen text classifier) load it through here.
 */

import { bold, dim, pc } from "../cli/render/theme";

// Minimal structural view of the bits of @huggingface/transformers we use.
// biome-ignore lint/suspicious/noExplicitAny: external lib has complex generics
type Any = any;

export interface TransformersModule {
	AutoTokenizer: { from_pretrained(id: string, opts?: Any): Promise<Any> };
	AutoProcessor: { from_pretrained(id: string, opts?: Any): Promise<Any> };
	Moondream1ForConditionalGeneration: {
		from_pretrained(id: string, opts: Any): Promise<Any>;
	};
	Qwen3_5ForConditionalGeneration: {
		from_pretrained(id: string, opts: Any): Promise<Any>;
	};
	RawImage: { read(src: string): Promise<Any> };
}

interface ProgressEvent {
	status: string;
	file?: string;
	loaded?: number;
	total?: number;
}

export interface LoadProgress {
	/** Render the initial 0% state before model imports or file discovery. */
	start: () => void;
	/** Pass as `progress_callback` to `from_pretrained`. */
	onProgress: (event: ProgressEvent) => void;
	/** Call once the model and its runtime session are ready. */
	done: () => void;
	/** Stop the live view and report a load failure. */
	fail: () => void;
}

interface InteractiveLoad {
	label: string;
	startedAt: number;
	loaded: number;
	total: number;
	status: "loading" | "ready" | "failed";
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERACTIVE_REFRESH_MS = 80;
const NON_INTERACTIVE_HEARTBEAT_MS = 10_000;
const interactiveLoads = new Map<symbol, InteractiveLoad>();
let interactiveLinesDrawn = 0;
let interactiveFrame = 0;
let interactiveTimer: NodeJS.Timeout | undefined;

const toMb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);
const elapsed = (startedAt: number): string =>
	`${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

function clearInteractiveRows(): void {
	if (interactiveLinesDrawn === 0) return;
	process.stderr.write(`\x1b[${interactiveLinesDrawn}F\x1b[J`);
	interactiveLinesDrawn = 0;
}

function interactiveLine(load: InteractiveLoad): string {
	const duration = dim(`· ${elapsed(load.startedAt)}`);
	const size = load.total > 0 ? dim(`(${toMb(load.total)} MB)`) : "";
	if (load.status === "ready") {
		return `  ${pc.green("✓")} ${bold(load.label)} model ready ${size} ${duration}`.trimEnd();
	}
	if (load.status === "failed") {
		return `  ${pc.red("✗")} ${bold(load.label)} model failed ${duration}`;
	}

	const pct =
		load.total > 0
			? Math.min(100, Math.floor((load.loaded / load.total) * 100))
			: 0;
	const transferred =
		load.total > 0
			? `${pct}% ${dim(`(${toMb(load.loaded)}/${toMb(load.total)} MB)`)}`
			: `0% ${dim("(0.0 MB)")}`;
	const phase =
		load.total > 0 && load.loaded >= load.total
			? dim("initializing runtime")
			: "loading";
	return `  ${pc.cyan(SPINNER_FRAMES[interactiveFrame])} ${bold(load.label)} model ${phase} ${transferred} ${duration}`;
}

function stopInteractiveTimer(): void {
	if (!interactiveTimer) return;
	clearInterval(interactiveTimer);
	interactiveTimer = undefined;
}

function redrawInteractiveRows(): void {
	clearInteractiveRows();
	let complete = interactiveLoads.size > 0;
	for (const load of interactiveLoads.values()) {
		process.stderr.write(`${interactiveLine(load)}\n`);
		if (load.status === "loading") complete = false;
	}
	if (complete) {
		interactiveLinesDrawn = 0;
		interactiveLoads.clear();
		stopInteractiveTimer();
		return;
	}
	interactiveLinesDrawn = interactiveLoads.size;
}

function startInteractiveTimer(): void {
	if (interactiveTimer) return;
	interactiveTimer = setInterval(() => {
		interactiveFrame = (interactiveFrame + 1) % SPINNER_FRAMES.length;
		redrawInteractiveRows();
	}, INTERACTIVE_REFRESH_MS);
	interactiveTimer.unref();
}

function setInteractiveLoad(
	id: symbol,
	load: InteractiveLoad,
	status: InteractiveLoad["status"],
): void {
	load.status = status;
	interactiveLoads.set(id, load);
	redrawInteractiveRows();
}

/**
 * Reports model loading from the instant warmup starts. Interactive terminals
 * get coordinated live rows for both concurrently loaded models, including an
 * elapsed timer while cached weights are converted into runtime sessions.
 * Append-only logs get 25% checkpoints and a ten-second heartbeat.
 */
export function createLoadProgress(
	label: string,
	opts?: { interactive?: boolean },
): LoadProgress {
	const interactive = opts?.interactive ?? Boolean(process.stderr.isTTY);
	const id = Symbol(label);
	const files = new Map<string, { loaded: number; total: number }>();
	const load: InteractiveLoad = {
		label,
		startedAt: Date.now(),
		loaded: 0,
		total: 0,
		status: "loading",
	};
	let started = false;
	let finished = false;
	let lastPct = -1;
	let lastBucket = -1;
	let heartbeat: NodeJS.Timeout | undefined;

	const totals = () => {
		let loaded = 0;
		let total = 0;
		for (const file of files.values()) {
			loaded += file.loaded;
			total += file.total;
		}
		const pct =
			total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
		return { loaded, total, pct };
	};

	const stopHeartbeat = () => {
		if (!heartbeat) return;
		clearInterval(heartbeat);
		heartbeat = undefined;
	};

	const start = () => {
		if (started) return;
		started = true;
		load.startedAt = Date.now();
		if (interactive) {
			interactiveLoads.set(id, load);
			startInteractiveTimer();
			redrawInteractiveRows();
			return;
		}
		process.stderr.write(
			`${dim("[blazediff]")} loading ${bold(label)} model ${dim("(first run may download weights)…")}\n`,
		);
		process.stderr.write(`  ${label}: 0% ${dim("(0.0 MB)")}\n`);
		lastBucket = 0;
		heartbeat = setInterval(() => {
			const { loaded, total, pct } = totals();
			const phase =
				total > 0 && loaded >= total ? "initializing runtime" : "still loading";
			const transfer =
				total > 0
					? `${pct}% (${toMb(loaded)}/${toMb(total)} MB)`
					: "0% (0.0 MB)";
			process.stderr.write(
				`  ${label}: ${phase} ${transfer} ${dim(`· ${elapsed(load.startedAt)}`)}\n`,
			);
		}, NON_INTERACTIVE_HEARTBEAT_MS);
		heartbeat.unref();
	};

	const finish = (status: "ready" | "failed") => {
		if (finished) return;
		start();
		finished = true;
		stopHeartbeat();
		if (interactive) {
			setInteractiveLoad(id, load, status);
			return;
		}
		const { total } = totals();
		const size = total > 0 ? dim(` (${toMb(total)} MB)`) : "";
		const state = status === "ready" ? pc.green("ready") : pc.red("failed");
		process.stderr.write(
			`  ${label}: ${state}${size} ${dim(`· ${elapsed(load.startedAt)}`)}\n`,
		);
	};

	return {
		start,
		onProgress(event: ProgressEvent) {
			start();
			if (!event.file) return;
			if (event.status === "done") {
				const file = files.get(event.file);
				if (!file) return;
				files.set(event.file, { loaded: file.total, total: file.total });
			} else {
				if (event.status !== "progress" || typeof event.total !== "number")
					return;
				files.set(event.file, {
					loaded: event.loaded ?? 0,
					total: event.total,
				});
			}
			const current = totals();
			load.loaded = current.loaded;
			load.total = current.total;
			if (current.pct === lastPct) return;
			lastPct = current.pct;
			if (interactive) {
				redrawInteractiveRows();
				return;
			}
			const bucket = Math.floor(current.pct / 25);
			if (bucket > lastBucket) {
				lastBucket = bucket;
				process.stderr.write(
					`  ${label}: ${current.pct}% ${dim(`(${toMb(current.loaded)}/${toMb(current.total)} MB)`)}\n`,
				);
			}
		},
		done: () => finish("ready"),
		fail: () => finish("failed"),
	};
}

export async function loadTransformersModel<T>(
	label: string,
	load: (
		mod: TransformersModule,
		onProgress: (event: ProgressEvent) => void,
	) => Promise<T>,
): Promise<T> {
	const progress = createLoadProgress(label);
	progress.start();
	try {
		const mod = await loadTransformers();
		const result = await load(mod, progress.onProgress);
		progress.done();
		return result;
	} catch (error) {
		progress.fail();
		throw error;
	}
}

export async function loadTransformers(): Promise<TransformersModule> {
	try {
		return (await import(
			"@huggingface/transformers"
		)) as unknown as TransformersModule;
	} catch (err) {
		throw new Error(
			'stack=local requires the optional peer dependency "@huggingface/transformers". Install it with `npm i @huggingface/transformers` (or pnpm/bun add).',
			{ cause: err instanceof Error ? err : undefined },
		);
	}
}
