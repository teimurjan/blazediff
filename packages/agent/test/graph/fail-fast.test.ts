import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCaptureNode } from "../../src/graph/nodes/capture";
import { createSemaphore } from "../../src/graph/semaphore";
import type { CaptureStateType } from "../../src/graph/state";
import { makeEntry } from "../../src/manifest";

const { captureScreenshotMock } = vi.hoisted(() => ({
	captureScreenshotMock: vi.fn(),
}));

vi.mock("../../src/browser/capture", () => ({
	captureScreenshot: captureScreenshotMock,
}));

function captureState(id: string): CaptureStateType {
	return {
		entry: makeEntry({ id, url: `/${id}` }),
		children: [],
		options: {
			baseUrl: "http://127.0.0.1:4000",
			cwd: "/tmp/blazediff-agent-test",
			concurrency: 1,
			emitDiffPng: true,
			judge: "none",
			baselinesDir: "/tmp/blazediff-agent-test/baselines",
		},
		captured: [],
	};
}

describe("fatal capture cancellation", () => {
	beforeEach(() => {
		captureScreenshotMock.mockReset();
	});

	it("does not start queued semaphore work after abort", async () => {
		const semaphore = createSemaphore(1);
		const controller = new AbortController();
		const timeout = new Error("navigation timed out");
		let releaseActive = () => {};
		let queuedStarted = false;

		const active = semaphore.run(
			() =>
				new Promise<void>((resolve) => {
					releaseActive = resolve;
				}),
		);
		const queued = semaphore.run(() => {
			queuedStarted = true;
			return Promise.resolve();
		}, controller.signal);

		controller.abort(timeout);

		await expect(queued).rejects.toBe(timeout);
		expect(queuedStarted).toBe(false);
		releaseActive();
		await active;
	});

	it("aborts sibling captures after the first fatal error", async () => {
		const semaphore = createSemaphore(1);
		const controller = new AbortController();
		const timeout = new Error("navigation timed out");
		let rejectCapture: (reason: Error) => void = () => {};

		captureScreenshotMock.mockImplementation(
			() =>
				new Promise<never>((_, reject) => {
					rejectCapture = reject;
				}),
		);

		const captureNode = makeCaptureNode(semaphore, controller);
		const first = captureNode(captureState("first"));
		await vi.waitFor(() =>
			expect(captureScreenshotMock).toHaveBeenCalledOnce(),
		);
		const second = captureNode(captureState("second"));
		const firstRejection = expect(first).rejects.toBe(timeout);
		const secondRejection = expect(second).rejects.toBe(timeout);

		rejectCapture(timeout);

		await Promise.all([firstRejection, secondRejection]);
		expect(controller.signal.reason).toBe(timeout);
		expect(captureScreenshotMock).toHaveBeenCalledOnce();
	});
});
