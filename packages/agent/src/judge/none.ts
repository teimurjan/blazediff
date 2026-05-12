import type { Judge, JudgeInput, JudgeOutput } from "./types";

export const noneJudge: Judge = {
	name: "none",
	async judge(input: JudgeInput): Promise<JudgeOutput> {
		return { kind: "judged", verdict: input.heuristicVerdict };
	},
};
