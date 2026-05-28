import path from "node:path";
import { captureScreenshot } from "../../browser/capture";
import { normalizeHarnessRefs, resolveHarnesses } from "../../captures";
import { DEFAULT_FULL_PAGE } from "../../defaults";
import { HarnessError } from "../../harness/loader";
import { isEntryStale, subNameOf } from "../../manifest";
import type { ManifestEntry } from "../../types";
import { emitEvent } from "../events";
import type { Semaphore } from "../semaphore";
import type { CapturedEntry, CaptureOutput, CaptureStateType } from "../state";
import { errorResult, staleResult } from "./results";

function asCaptured(
	entry: ManifestEntry,
	output: CaptureOutput,
): CapturedEntry {
	return { entry, output };
}

export function makeCaptureNode(semaphore: Semaphore) {
	return async function captureNode(
		state: CaptureStateType,
	): Promise<Partial<CaptureStateType>> {
		const entry = state.entry;
		const options = state.options;
		if (!entry || !options) {
			throw new Error("captureNode: entry or options missing");
		}
		const children = state.children;

		if (isEntryStale(entry)) {
			return {
				captured: [
					asCaptured(entry, {
						id: entry.id,
						skipResult: staleResult(entry),
					}),
					...children.map((c) =>
						asCaptured(c, { id: c.id, skipResult: staleResult(c) }),
					),
				],
			};
		}

		const failAll = (message: string): Partial<CaptureStateType> => ({
			captured: [
				asCaptured(entry, {
					id: entry.id,
					skipResult: errorResult(entry, message),
				}),
				...children.map((c) =>
					asCaptured(c, { id: c.id, skipResult: errorResult(c, message) }),
				),
			],
		});

		let harnesses: Awaited<ReturnType<typeof resolveHarnesses>>;
		try {
			harnesses = await resolveHarnesses(
				normalizeHarnessRefs(entry.harnesses),
				options.cwd,
			);
		} catch (err) {
			return failAll(`harness: ${(err as Error).message}`);
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
					harnesses,
				),
			);

			const items: CapturedEntry[] = [
				asCaptured(entry, {
					id: entry.id,
					captureOutputPath: capture.outputPath,
					baselinePath,
				}),
			];
			const subByName = new Map(
				(capture.subCaptures ?? []).map((s) => [s.name, s]),
			);
			for (const child of children) {
				const name = subNameOf(child);
				const sub = name ? subByName.get(name) : undefined;
				const childBaseline = path.join(
					options.baselinesDir,
					`${child.id}.png`,
				);
				if (sub) {
					items.push(
						asCaptured(child, {
							id: child.id,
							captureOutputPath: sub.outputPath,
							baselinePath: childBaseline,
						}),
					);
				} else {
					items.push(
						asCaptured(child, {
							id: child.id,
							skipResult: errorResult(
								child,
								`harness did not produce screenshot "${name ?? child.id}"`,
							),
						}),
					);
				}
			}
			for (const item of items) {
				if (item.output.captureOutputPath)
					emitEvent({ type: "captured", entryId: item.entry.id });
			}
			return { captured: items };
		} catch (err) {
			if (err instanceof HarnessError) {
				return failAll(`harness: ${err.message}`);
			}
			throw err;
		}
	};
}
