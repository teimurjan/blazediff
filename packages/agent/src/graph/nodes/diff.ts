import { diffEntry } from "../../diff";
import { emitEvent } from "../events";
import type { Semaphore } from "../semaphore";
import type { BranchStateType } from "../state";
import { missingBaselineResult } from "./results";

export function makeDiffNode(semaphore: Semaphore) {
	return async function diffNode(
		state: BranchStateType,
	): Promise<Partial<BranchStateType>> {
		const entry = state.entry;
		const options = state.options;
		const capture = state.captureOutput;
		if (!entry || !options || !capture) {
			throw new Error("diffNode: entry, options, or capture missing");
		}

		if (capture.skipResult) {
			return {
				diffOutput: { id: capture.id, skipResult: capture.skipResult },
			};
		}

		if (!capture.captureOutputPath || !capture.baselinePath) {
			throw new Error("diffNode: capture output paths missing");
		}

		const outcome = await semaphore.run(() => {
			emitEvent({ type: "diffing", entryId: entry.id, url: entry.url });
			return diffEntry(
				entry.id,
				capture.baselinePath as string,
				capture.captureOutputPath as string,
				{ threshold: options.threshold, emitDiffPng: options.emitDiffPng },
				options.cwd,
			);
		});

		if (outcome.reason === "file-not-exists") {
			return {
				diffOutput: {
					id: entry.id,
					skipResult: missingBaselineResult(entry, capture.baselinePath),
				},
			};
		}

		return {
			diffOutput: {
				id: entry.id,
				outcome,
				baselinePath: capture.baselinePath,
				captureOutputPath: capture.captureOutputPath,
			},
		};
	};
}
