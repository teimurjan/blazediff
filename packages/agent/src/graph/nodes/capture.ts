import path from "node:path";
import { captureScreenshot } from "../../browser/capture";
import { DEFAULT_FULL_PAGE } from "../../defaults";
import { isEntryStale } from "../../manifest";
import type { Semaphore } from "../semaphore";
import type { BranchStateType } from "../state";
import { skipResult, staleResult } from "./results";

export function makeCaptureNode(semaphore: Semaphore) {
	return async function captureNode(
		state: BranchStateType,
	): Promise<Partial<BranchStateType>> {
		const entry = state.entry;
		const options = state.options;
		if (!entry || !options) {
			throw new Error("captureNode: entry or options missing");
		}

		if (entry.auth === "required") {
			return {
				captureOutput: {
					id: entry.id,
					skipResult: skipResult(
						entry,
						"skipped: auth required (deferred to v0.2)",
					),
				},
			};
		}
		if (isEntryStale(entry)) {
			return {
				captureOutput: { id: entry.id, skipResult: staleResult(entry) },
			};
		}

		const baselinePath = path.join(options.baselinesDir, `${entry.id}.png`);
		const capture = await semaphore.run(() =>
			captureScreenshot(
				options.baseUrl,
				{
					id: entry.id,
					url: entry.url,
					viewport: entry.viewport,
					mask: entry.mask,
					waitFor: entry.waitFor,
					fullPage: entry.fullPage ?? DEFAULT_FULL_PAGE,
					mode: "actual",
				},
				options.cwd,
			),
		);

		return {
			captureOutput: {
				id: entry.id,
				captureOutputPath: capture.outputPath,
				baselinePath,
			},
		};
	};
}
