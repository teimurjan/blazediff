import { interrupt } from "@langchain/langgraph";
import type { Verdict } from "../diff/verdict";
import type { CheckResult } from "../types";

export interface JudgmentInterrupt {
	kind: "host-judgment-required";
	entryId: string;
	url: string;
	requestPath: string;
	signature: string;
	pendingResult: CheckResult;
}

export type JudgmentResume = Record<string, Verdict>;

export function interruptForJudgment(
	payload: JudgmentInterrupt,
): Verdict | undefined {
	const resume = interrupt(payload) as JudgmentResume | undefined;
	if (!resume || typeof resume !== "object") return undefined;
	return resume[payload.entryId];
}
