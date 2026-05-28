/**
 * Lazy, reused Moondream 2 vision runner — step 1 of the local judge.
 *
 * Exposes a holder factory (`createVisionRunnerHolder`) that owns its own
 * lazy-loaded model. Tests construct fresh holders with a fake factory; the
 * default singleton (`getVisionRunner`) is what the CLI uses — loaded once,
 * reused across every judgment in a run.
 *
 * `Xenova/moondream2` is a LLaVA-style VLM; `@huggingface/transformers@4.x` has
 * no `image-text-to-text` pipeline task for it, so we drive the lower-level
 * model + processor + tokenizer directly. Two model-specific details:
 *   - dtype: the fp16 vision encoder fails to load on onnxruntime-node, so the
 *     vision encoder runs q8 and the decoder q4.
 *   - the processor ships no config, so the `<image>` placeholder is expanded to
 *     one token per vision patch ((H/patch)·(W/patch)) by hand before decoding.
 */

import { createLoadProgress, loadTransformers } from "./transformers";

export interface VisionRunner {
	/** Answer `question` about the image at `imagePath`; returns the model's text. */
	describe(imagePath: string, question: string): Promise<string>;
}

export type VisionRunnerFactory = () => Promise<VisionRunner>;

export interface VisionRunnerHolder {
	/** Loads (or returns the cached) runner; multiple callers share one model. */
	get(): Promise<VisionRunner>;
}

const MODEL_ID = "Xenova/moondream2";
const PATCH_SIZE = 14; // moondream vision patch size
const MAX_NEW_TOKENS = 64;
const ANSWER_MARKER = "Answer:";

async function defaultFactory(): Promise<VisionRunner> {
	const mod = await loadTransformers();
	const progress = createLoadProgress("vision");
	const progress_callback = progress.onProgress;
	const [tokenizer, processor, model] = await Promise.all([
		mod.AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
		mod.AutoProcessor.from_pretrained(MODEL_ID, { progress_callback }),
		mod.Moondream1ForConditionalGeneration.from_pretrained(MODEL_ID, {
			dtype: {
				embed_tokens: "fp32",
				vision_encoder: "q8",
				decoder_model_merged: "q4",
			},
			device: "cpu",
			progress_callback,
		}),
	]);
	progress.done();

	return {
		async describe(imagePath: string, question: string): Promise<string> {
			const image = await mod.RawImage.read(imagePath);
			const vision = await processor(image);
			const [, , height, width] = vision.pixel_values.dims as number[];
			const numImageTokens =
				Math.floor(height / PATCH_SIZE) * Math.floor(width / PATCH_SIZE);
			const prompt = `${"<image>".repeat(numImageTokens)}\n\nQuestion: ${question}\n\n${ANSWER_MARKER}`;
			const textInputs = tokenizer(prompt);
			const output = await model.generate({
				...textInputs,
				...vision,
				do_sample: false,
				max_new_tokens: MAX_NEW_TOKENS,
				// Moondream loops the same sentence on composite tiles without these.
				repetition_penalty: 1.3,
				no_repeat_ngram_size: 3,
			});
			const decoded = tokenizer.batch_decode(output, {
				skip_special_tokens: true,
			});
			const raw = Array.isArray(decoded)
				? String(decoded[0] ?? "")
				: String(decoded);
			// batch_decode echoes the prompt; keep only what follows the last "Answer:".
			const idx = raw.lastIndexOf(ANSWER_MARKER);
			return (idx >= 0 ? raw.slice(idx + ANSWER_MARKER.length) : raw).trim();
		},
	};
}

/**
 * Create a fresh holder. The first `get()` invokes `factory` and memoizes the
 * resulting promise; subsequent calls reuse it. Construct one per judge
 * instance — the CLI uses the default singleton below; tests inject their own.
 */
export function createVisionRunnerHolder(
	factory: VisionRunnerFactory = defaultFactory,
): VisionRunnerHolder {
	let runnerPromise: Promise<VisionRunner> | undefined;
	return {
		get() {
			if (!runnerPromise) runnerPromise = factory();
			return runnerPromise;
		},
	};
}

/** Default singleton: one model load per CLI process. */
const defaultHolder = createVisionRunnerHolder();
export const getVisionRunner = (): Promise<VisionRunner> => defaultHolder.get();
