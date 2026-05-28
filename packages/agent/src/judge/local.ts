import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Verdict, VerdictAction, VerdictLabel } from "../diff/verdict";
import { createSemaphore } from "../graph/semaphore";
import { paths } from "../paths";
import {
	type ClassifierRunnerHolder,
	createClassifierRunnerHolder,
} from "./classifier";
import { describeRegionChange } from "./region-diff";
import { prepareRegionReads } from "./tiles";
import type {
	Judge,
	JudgeFailureReason,
	JudgeInput,
	JudgeOutput,
} from "./types";
import { createVisionRunnerHolder, type VisionRunnerHolder } from "./vision";

/**
 * Step 1, region path: Moondream *reads* each side of a changed region on its
 * own. It is far more accurate reading one tight crop than comparing two — the
 * comparison framing makes it invent differences — so the actual diffing is done
 * deterministically downstream in `describeRegionChange`.
 */
const READ_PROMPT = [
	"Read the text in this image. Reply with only the exact words and numbers you",
	'see, wrapped in double quotes. If there is no text, reply "".',
].join(" ");

/**
 * Step 1, fallback path: no per-region crops, so the image is the full new
 * screenshot with no original to compare against. Just describe it neutrally;
 * the classifier leans on the deterministic summary for the change itself.
 */
const DESCRIBE_PROMPT = [
	"In one sentence, describe the main UI elements and any visible text in this",
	"screenshot. Do not judge whether it is good or bad.",
].join(" ");

const LABELS: VerdictLabel[] = [
	"regression-likely",
	"intentional-likely",
	"noise-likely",
	"ambiguous",
];

const ACTION_BY_LABEL: Record<VerdictLabel, VerdictAction> = {
	"regression-likely": "investigate",
	"intentional-likely": "rewrite-if-intended",
	"noise-likely": "ignore-or-rewrite",
	ambiguous: "investigate",
};

const VERDICT_MARKER = "VERDICT:";

/** Condense the deterministic interpret result into a few lines for the classifier. */
function summarizeInterpret(input: JudgeInput): string {
	const lines: string[] = [];
	lines.push(
		`diff area: ${(input.diffPercentage ?? 0).toFixed(3)}% of the page`,
	);
	lines.push(`severity: ${input.severity ?? "unknown"}`);
	const regions = input.regions ?? [];
	lines.push(`changed regions: ${regions.length}`);
	if (regions.length > 0) {
		const counts = new Map<string, number>();
		for (const r of regions)
			counts.set(r.changeType, (counts.get(r.changeType) ?? 0) + 1);
		const byType = [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([type, n]) => `${type} x${n}`)
			.join(", ");
		lines.push(`change types: ${byType}`);
	}
	return lines.join("\n");
}

/**
 * Build the step-2 classify prompt. The model reasons *first* and commits to a
 * label *last* — a 0.8B model that emits the label up front anchors on a safe
 * default (regression) and then rationalizes against it; reasoning first lets
 * the conclusion follow the evidence.
 */
function buildClassifyPrompt(summary: string, description: string): string {
	return [
		"You classify a visual regression-test diff into exactly one label.",
		"",
		"Deterministic analysis of the changed pixels:",
		summary,
		"",
		"The change in the affected region, read from the screenshots, is:",
		`"${description}"`,
		"",
		"Labels:",
		"- regression-likely: something looks broken, missing, clipped, or misaligned.",
		"- intentional-likely: a deliberate content or style update.",
		"- noise-likely: negligible anti-aliasing / sub-pixel rendering differences.",
		"- ambiguous: cannot tell from the evidence.",
		"",
		"First explain your reasoning in one short sentence. Then, on the final",
		`line, write "${VERDICT_MARKER} <label>" using exactly one label above.`,
	].join("\n");
}

/**
 * Extract the verdict label. Prefer the explicit `VERDICT:` line; otherwise
 * take the label that appears *latest* in the text, since the prompt asks for
 * the conclusion last. Null when the model never commits.
 */
function parseLabel(text: string): VerdictLabel | null {
	const t = text.toLowerCase();
	const marked = t.match(/verdict:\s*([a-z-]+)/);
	if (marked) {
		const hit = LABELS.find((label) => marked[1].startsWith(label));
		if (hit) return hit;
	}
	let latest: { label: VerdictLabel; idx: number } | null = null;
	for (const label of LABELS) {
		const idx = t.lastIndexOf(label);
		if (idx >= 0 && (!latest || idx > latest.idx)) latest = { label, idx };
	}
	return latest?.label ?? null;
}

function firstSentence(text: string): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	const m = trimmed.match(/^.*?[.!?](\s|$)/);
	return (m ? m[0] : trimmed).trim();
}

/** The reasoning is everything before the VERDICT line; fall back to the answer. */
function reasonOf(answer: string, label: VerdictLabel): string {
	const beforeVerdict = answer.split(/verdict:/i)[0];
	const withoutLabel = beforeVerdict
		.replace(new RegExp(label, "gi"), "")
		.trim();
	return firstSentence(withoutLabel) || firstSentence(answer);
}

function toError(err: unknown): Error {
	return err instanceof Error ? err : new Error(String(err));
}

function classifyFailure(err: Error): JudgeFailureReason {
	// Coarse triage; precise categorization isn't load-bearing — callers just
	// want enough context for logs/metrics. Anything that mentions model load /
	// download / weights buckets as "model-load"; file/sharp/crop errors as
	// "read"; everything else as "internal".
	const m = err.message.toLowerCase();
	if (
		m.includes("model") ||
		m.includes("weights") ||
		m.includes("download") ||
		m.includes("transformers")
	)
		return "model-load";
	if (
		m.includes("enoent") ||
		m.includes("read") ||
		m.includes("sharp") ||
		m.includes("crop")
	)
		return "read";
	return "internal";
}

export interface LocalJudgeDeps {
	/** Pre-built vision holder. Default: a fresh singleton over the real model. */
	vision?: VisionRunnerHolder;
	/** Pre-built classifier holder. Default: a fresh singleton over the real model. */
	classifier?: ClassifierRunnerHolder;
}

/**
 * Build a local judge. Each instance owns its own vision/classifier holders and
 * stage semaphores, so unit tests can construct fresh judges per case without
 * leaking state between them. The CLI uses the default `localJudge` singleton.
 *
 * Vision and classifier are two separate ONNX sessions, so each serializes its
 * own calls but they can run in parallel with each other. With a single
 * semaphore wrapping the whole judge call, while test A was on the classifier,
 * test B sat idle. Splitting into two per-stage limit-1 semaphores pipelines the
 * work: as soon as test A releases vision, test B can start its vision step in
 * parallel with A's classifier step. ~30–50% throughput win on local judge runs
 * with no extra memory cost (still one session per model).
 */
export function createLocalJudge(deps: LocalJudgeDeps = {}): Judge {
	const vision = deps.vision ?? createVisionRunnerHolder();
	const classifier = deps.classifier ?? createClassifierRunnerHolder();
	const visionSemaphore = createSemaphore(1);
	const classifierSemaphore = createSemaphore(1);

	/**
	 * Step 1: describe the change. For each top region, read the baseline and
	 * actual crops separately and diff the reads deterministically, yielding a
	 * precise statement like `added "123" (region now reads "Nimbus 123")`.
	 * Returns null when there are no usable regions, so the caller falls back to
	 * describing the full screenshot.
	 */
	async function describeChange(
		input: JudgeInput,
		entryDir: string,
	): Promise<string | null> {
		if (!input.regions || input.regions.length === 0) return null;
		try {
			const crops = await prepareRegionReads({
				regions: input.regions,
				baselinePath: input.baselinePath,
				actualPath: input.actualPath,
				outputDir: entryDir,
			});
			if (crops.length === 0) return null;

			const v = await vision.get();
			const phrases = await Promise.all(
				crops.map(async (crop) => {
					const [before, after] = await Promise.all([
						v.describe(crop.beforePath, READ_PROMPT),
						v.describe(crop.afterPath, READ_PROMPT),
					]);
					return describeRegionChange(crop.changeType, before, after);
				}),
			);
			return phrases.length === 1
				? phrases[0]
				: phrases.map((p, i) => `region ${i + 1}: ${p}`).join("; ");
		} catch {
			return null; // crop/read failed → caller falls back to the full screenshot
		}
	}

	async function describeScreenshot(input: JudgeInput): Promise<string> {
		const v = await vision.get();
		return (await v.describe(input.actualPath, DESCRIBE_PROMPT)).trim();
	}

	return {
		name: "local",
		// Stream both models' weights up front (concurrently) so the multi-second
		// load is a single visible phase before judging, not a silent stall on the
		// first test. Both are cached promises, so the judge reuses them after.
		async warmup(): Promise<void> {
			await Promise.all([vision.get(), classifier.get()]);
		},
		async judge(input: JudgeInput, cwd: string): Promise<JudgeOutput> {
			const entryDir = path.join(paths(cwd).judgments, input.entry.id);
			await mkdir(entryDir, { recursive: true });

			try {
				// Step 1 — describe the change. Held under the vision semaphore so the
				// stage serializes across tests, and emit `onJudgingStart` here (not
				// before the acquire) so the CLI's "judging X" line marks the real
				// pipeline moment when X is actually being worked on.
				const description = await visionSemaphore.run(async () => {
					input.onJudgingStart?.();
					const fromRegions = await describeChange(input, entryDir);
					const text = fromRegions ?? (await describeScreenshot(input));
					return text.trim();
				});

				// Step 2 — classify from the interpret summary + the description. The
				// classifier semaphore is independent of vision's, so the *next* test
				// can already be running its vision step while this classifier runs.
				const summary = summarizeInterpret(input);
				const prompt = buildClassifyPrompt(summary, description);
				const answer = await classifierSemaphore.run(async () => {
					const c = await classifier.get();
					return (await c.complete(prompt)).trim();
				});
				const label = parseLabel(answer);

				if (!label) {
					// Classifier was non-committal — keep the deterministic heuristic verdict.
					return {
						kind: "judged",
						verdict: input.heuristicVerdict,
						rationale: `${description}\n${answer}`.trim(),
					};
				}

				const reason = reasonOf(answer, label);
				const verdict: Verdict = {
					label,
					headline: reason || input.heuristicVerdict.headline,
					// The headline already carries the classifier's reasoning; keep only
					// the deterministic region read here so the report doesn't repeat the
					// reasoning or echo the raw `VERDICT:` line back to the reader.
					rationale: [description].filter(Boolean),
					action: ACTION_BY_LABEL[label],
				};
				return { kind: "judged", verdict, rationale: answer, confidence: 0.6 };
			} catch (err) {
				const error = toError(err);
				return {
					kind: "failed",
					reason: classifyFailure(error),
					error,
					fallback: input.heuristicVerdict,
				};
			}
		},
	};
}

/** Default singleton used by the CLI. Tests build their own via `createLocalJudge`. */
export const localJudge: Judge = createLocalJudge();
