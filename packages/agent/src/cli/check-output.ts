import { DEFAULT_LOCAL_MODEL } from "../defaults";
import type { JudgeBackend, LocalModel } from "../judge";
import type { CheckReport, CheckResult } from "../types";

export function slimResult(r: CheckResult) {
	return {
		id: r.id,
		url: r.url,
		status: r.status,
		verdict: r.verdict
			? {
					label: r.verdict.label,
					headline: r.verdict.headline,
					action: r.verdict.action,
				}
			: undefined,
	};
}

export function slimReport(report: CheckReport, reportPath: string) {
	return {
		reportPath,
		createdAt: report.createdAt,
		totalEntries: report.totalEntries,
		passed: report.passed,
		failed: report.failed,
		pendingJudgments: report.pendingJudgments,
		results: report.results.filter((r) => r.status !== "pass").map(slimResult),
	};
}

/** Pre-rename names, still written in configs and older docs. */
const JUDGE_ALIASES: Record<string, JudgeBackend> = {
	host: "agent",
	moondream: "local",
};

export function parseJudge(input: string): JudgeBackend {
	const aliased = JUDGE_ALIASES[input] ?? input;
	if (aliased === "agent" || aliased === "none" || aliased === "local")
		return aliased;
	throw new Error(
		`unknown --judge backend: ${input} (expected: agent | none | local)`,
	);
}

const LOCAL_MODELS: LocalModel[] = [
	"moondream-2-2b-onnx",
	"moondream-3-9b-mlx",
];

/**
 * `--model` picks which model the local judge reads with, so it is meaningless
 * for the backends that run no model of their own.
 */
export function parseLocalModel(
	judge: JudgeBackend,
	input: string | undefined,
): LocalModel {
	if (input === undefined) return DEFAULT_LOCAL_MODEL;
	if (judge !== "local") {
		throw new Error(`--model applies to --judge local, not --judge ${judge}`);
	}
	const model = LOCAL_MODELS.find((candidate) => candidate === input);
	if (!model) {
		throw new Error(
			`unknown --model: ${input} (expected: ${LOCAL_MODELS.join(" | ")})`,
		);
	}
	return model;
}
