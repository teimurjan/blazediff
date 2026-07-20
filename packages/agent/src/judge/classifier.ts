/**
 * Lazy, reused Qwen3.5-0.8B text runner — step 2 of the local judge.
 *
 * Step 1 (the Moondream vision runner) describes what changed; this runner takes
 * that description plus the deterministic `interpret` summary and picks the
 * verdict label. It is text-only: we feed a text chat message (no image), so the
 * model's vision encoder loads but is never exercised.
 *
 * Exposes a holder factory (`createClassifierRunnerHolder`) mirroring
 * `vision.ts`. The CLI uses the default singleton; tests inject their own.
 */

import { loadTransformersModel } from "./transformers";

export interface ClassifierRunner {
	/** Run `prompt` as a single user turn; returns the model's completion text. */
	complete(prompt: string): Promise<string>;
}

export type ClassifierRunnerFactory = () => Promise<ClassifierRunner>;

export interface ClassifierRunnerHolder {
	/** Loads (or returns the cached) runner; multiple callers share one model. */
	get(): Promise<ClassifierRunner>;
}

const MODEL_ID = "onnx-community/Qwen3.5-0.8B-ONNX";
const MAX_NEW_TOKENS = 64;

async function defaultFactory(): Promise<ClassifierRunner> {
	const { tokenizer, model } = await loadTransformersModel(
		"classifier",
		async (mod, progress_callback) => {
			const [tokenizer, model] = await Promise.all([
				mod.AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback }),
				mod.Qwen3_5ForConditionalGeneration.from_pretrained(MODEL_ID, {
					dtype: {
						embed_tokens: "fp32",
						vision_encoder: "q8",
						decoder_model_merged: "q4",
					},
					device: "cpu",
					progress_callback,
				}),
			]);
			return { tokenizer, model };
		},
	);

	return {
		async complete(prompt: string): Promise<string> {
			const inputs = tokenizer.apply_chat_template(
				[{ role: "user", content: prompt }],
				{
					add_generation_prompt: true,
					return_dict: true,
					enable_thinking: false,
				},
			);
			const output = await model.generate({
				...inputs,
				do_sample: false,
				max_new_tokens: MAX_NEW_TOKENS,
			});
			// generate() echoes the prompt tokens; keep only the newly generated tail.
			const promptLen = inputs.input_ids.dims.at(-1) as number;
			const generated = output.slice(null, [promptLen, null]);
			const decoded = tokenizer.batch_decode(generated, {
				skip_special_tokens: true,
			});
			const raw = Array.isArray(decoded)
				? String(decoded[0] ?? "")
				: String(decoded);
			return raw.trim();
		},
	};
}

/**
 * Create a fresh holder. The first `get()` invokes `factory` and memoizes the
 * resulting promise; subsequent calls reuse it. Construct one per judge
 * instance — the CLI uses the default singleton below; tests inject their own.
 */
export function createClassifierRunnerHolder(
	factory: ClassifierRunnerFactory = defaultFactory,
): ClassifierRunnerHolder {
	let runnerPromise: Promise<ClassifierRunner> | undefined;
	return {
		get() {
			if (!runnerPromise) runnerPromise = factory();
			return runnerPromise;
		},
	};
}

/** Default singleton: one model load per CLI process. */
const defaultHolder = createClassifierRunnerHolder();
export const getClassifierRunner = (): Promise<ClassifierRunner> =>
	defaultHolder.get();
