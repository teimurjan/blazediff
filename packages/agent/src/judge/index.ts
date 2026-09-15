import { DEFAULT_LOCAL_MODEL } from "../defaults";
import { agentJudge } from "./agent";
import { onnxLocalJudge } from "./local-moondream-2-2b-onnx";
import { mlxLocalJudge } from "./local-moondream-3-9b-mlx";
import { noneJudge } from "./none";
import type { Judge, JudgeBackend, LocalModel } from "./types";

export type { ApplyJudgmentsResult } from "./apply";
export { applyJudgments } from "./apply";
export type { JudgmentRequest } from "./persist";
export { signatureOf, writeJudgments } from "./persist";
export type {
	Judge,
	JudgeBackend,
	JudgeInput,
	JudgeOutput,
	JudgmentRequestRegion,
	LocalModel,
	VerdictFile,
} from "./types";

export function resolveJudge(
	backend: JudgeBackend,
	model: LocalModel = DEFAULT_LOCAL_MODEL,
): Judge {
	switch (backend) {
		case "none":
			return noneJudge;
		case "agent":
			return agentJudge;
		case "local":
			return model === "moondream-3-9b-mlx" ? mlxLocalJudge : onnxLocalJudge;
	}
}
