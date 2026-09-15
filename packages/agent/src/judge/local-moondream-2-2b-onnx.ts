/**
 * `local` judge on `moondream-2-2b-onnx`: Moondream 2 driven in-process through
 * onnxruntime-node. Portable and setup-free, and the default — but CPU-only, so
 * a region read costs ~11s. See `local-moondream-3-9b-mlx.ts` for the GPU path.
 *
 * `Xenova/moondream2` is a LLaVA-style VLM; `@huggingface/transformers@4.x` has
 * no `image-text-to-text` pipeline task for it, so we drive the lower-level
 * model + processor + tokenizer directly. Two model-specific details:
 *   - dtype: the fp16 vision encoder fails to load on onnxruntime-node, so the
 *     vision encoder runs q8 and the decoder q4.
 *   - the processor ships no config, so the `<image>` placeholder is expanded to
 *     one token per vision patch ((H/patch)·(W/patch)) by hand before decoding.
 */

import { createLocalJudge } from "./local";
import { loadTransformersModel } from "./transformers";
import type { Judge } from "./types";
import { createVisionRunnerHolder, type VisionRunner } from "./vision";

const MODEL_ID = "Xenova/moondream2";
const PATCH_SIZE = 14; // moondream vision patch size
const MAX_NEW_TOKENS = 64;
const ANSWER_MARKER = "Answer:";

export async function createOnnxVisionRunner(): Promise<VisionRunner> {
	const { mod, tokenizer, processor, model } = await loadTransformersModel(
		"vision",
		async (mod, progress_callback) => {
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
			return { mod, tokenizer, processor, model };
		},
	);

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

export function createOnnxLocalJudge(): Judge {
	return createLocalJudge({
		vision: createVisionRunnerHolder(createOnnxVisionRunner),
		name: "local:moondream-2-2b-onnx",
	});
}

/** Default singleton used by the CLI. Tests build their own via `createOnnxLocalJudge`. */
export const onnxLocalJudge: Judge = createOnnxLocalJudge();
