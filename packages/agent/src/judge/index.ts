import { codingAgentHostJudge } from "./coding-agent-host";
import { localJudge } from "./local";
import { noneJudge } from "./none";
import type { Judge, JudgeBackend } from "./types";

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
	VerdictFile,
} from "./types";

export function resolveJudge(backend: JudgeBackend): Judge {
	switch (backend) {
		case "none":
			return noneJudge;
		case "host":
			return codingAgentHostJudge;
		case "local":
			return localJudge;
	}
}
