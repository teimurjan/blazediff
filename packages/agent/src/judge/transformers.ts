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
	/** Pass as `progress_callback` to `from_pretrained`. */
	onProgress: (event: ProgressEvent) => void;
	/** Call once loading resolves to finalize the line. */
	done: () => void;
}

const toMb = (bytes: number): string => (bytes / 1_048_576).toFixed(1);

/**
 * Reports weight download/load progress for `--judge local` on stderr —
 * without it the command sits silent for minutes on first run while hundreds
 * of MB stream from the Hub. The model's files load concurrently, so bytes are
 * aggregated into a single percentage that updates in place (`\r`) on a TTY,
 * giving one moving line per model. Non-TTY output (CI logs) falls back to a
 * line per 25% so it isn't a flood of carriage returns.
 */
export function createLoadProgress(label: string): LoadProgress {
	const interactive = Boolean(process.stderr.isTTY);
	const bytes = new Map<string, { loaded: number; total: number }>();
	let announced = false;
	let lastPct = -1;
	let lastBucket = -1;

	const totals = () => {
		let loaded = 0;
		let total = 0;
		for (const b of bytes.values()) {
			loaded += b.loaded;
			total += b.total;
		}
		const pct =
			total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
		return { loaded, total, pct };
	};

	return {
		onProgress(event: ProgressEvent) {
			if (!announced) {
				process.stderr.write(
					`${dim("[blazediff]")} loading ${bold(label)} model ${dim("(first run downloads weights)…")}\n`,
				);
				announced = true;
			}
			if (
				event.status !== "progress" ||
				!event.file ||
				typeof event.total !== "number"
			)
				return;
			bytes.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
			const { loaded, total, pct } = totals();
			if (pct === lastPct) return;
			lastPct = pct;
			const line = `  ${label}: ${pct}% ${dim(`(${toMb(loaded)}/${toMb(total)} MB)`)}`;
			if (interactive) {
				// \x1b[K clears any longer previous line left on the row.
				process.stderr.write(`\r${line}\x1b[K`);
				return;
			}
			const bucket = Math.floor(pct / 25);
			if (bucket > lastBucket) {
				lastBucket = bucket;
				process.stderr.write(`${line}\n`);
			}
		},
		done() {
			if (!announced) return;
			if (interactive) {
				const { total } = totals();
				const size = total > 0 ? dim(` (${toMb(total)} MB)`) : "";
				process.stderr.write(
					`\r  ${label}: ${pc.green("ready")}${size}\x1b[K\n`,
				);
			} else if (lastPct < 100) {
				process.stderr.write(`  ${label}: ${pc.green("ready")}\n`);
			}
		},
	};
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
