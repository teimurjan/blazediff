import path from "node:path";
import { LEGACY_REQUIRED } from "../../auth/env";
import { AuthHarnessError } from "../../auth/harness";
import { AuthConfigMissingError, buildAuthHook } from "../../auth/hook";
import { type CaptureAuth, captureScreenshot } from "../../browser/capture";
import { DEFAULT_FULL_PAGE } from "../../defaults";
import { isEntryStale } from "../../manifest";
import type { Semaphore } from "../semaphore";
import type { BranchStateType } from "../state";
import { errorResult, staleResult } from "./results";

let legacyAuthHinted = false;

function maybePrintLegacyHint(): void {
	if (legacyAuthHinted) return;
	legacyAuthHinted = true;
	process.stderr.write(
		'blazediff: manifest entries with auth: "required" are treated as persona "default" — please migrate.\n',
	);
}

export function makeCaptureNode(semaphore: Semaphore) {
	return async function captureNode(
		state: BranchStateType,
	): Promise<Partial<BranchStateType>> {
		const entry = state.entry;
		const options = state.options;
		if (!entry || !options) {
			throw new Error("captureNode: entry or options missing");
		}

		if (isEntryStale(entry)) {
			return {
				captureOutput: { id: entry.id, skipResult: staleResult(entry) },
			};
		}

		let auth: CaptureAuth | undefined;
		if (entry.auth !== null) {
			if (entry.auth === LEGACY_REQUIRED) maybePrintLegacyHint();
			try {
				auth = buildAuthHook(entry.auth, options.auth, options.cwd);
			} catch (err) {
				if (err instanceof AuthConfigMissingError) {
					return {
						captureOutput: {
							id: entry.id,
							skipResult: errorResult(entry, err.message),
						},
					};
				}
				throw err;
			}
		}

		const baselinePath = path.join(options.baselinesDir, `${entry.id}.png`);
		try {
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
					auth,
				),
			);

			return {
				captureOutput: {
					id: entry.id,
					captureOutputPath: capture.outputPath,
					baselinePath,
				},
			};
		} catch (err) {
			if (err instanceof AuthHarnessError) {
				return {
					captureOutput: {
						id: entry.id,
						skipResult: errorResult(entry, `auth: ${err.message}`),
					},
				};
			}
			throw err;
		}
	};
}
