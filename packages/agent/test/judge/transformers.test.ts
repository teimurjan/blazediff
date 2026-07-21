import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import { createLoadProgress } from "../../src/judge/transformers";

describe("createLoadProgress", () => {
	let writes: string[];
	let writeSpy: MockInstance;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		writes = [];
		writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation((chunk: unknown) => {
				writes.push(String(chunk));
				return true;
			});
	});

	afterEach(() => {
		writeSpy.mockRestore();
		vi.useRealTimers();
	});

	it("renders 0% immediately and stays active during cached initialization", () => {
		const progress = createLoadProgress("vision", { interactive: false });
		progress.start();

		expect(writes.join("")).toContain("loading vision model");
		expect(writes.join("")).toContain("vision: 0% (0.0 MB)");

		vi.advanceTimersByTime(10_000);
		expect(writes.at(-1)).toContain("still loading 0% (0.0 MB)");
		expect(writes.at(-1)).toContain("10.0s");

		progress.onProgress({
			status: "progress",
			file: "weights.onnx",
			loaded: 100 * 1_048_576,
			total: 100 * 1_048_576,
		});
		vi.advanceTimersByTime(10_000);
		expect(writes.at(-1)).toContain(
			"initializing runtime 100% (100.0/100.0 MB)",
		);

		progress.done();
		expect(writes.at(-1)).toContain("vision: ready");
	});

	it("keeps concurrent interactive models in one live region", () => {
		const vision = createLoadProgress("vision", { interactive: true });
		const classifier = createLoadProgress("classifier", { interactive: true });
		vision.start();
		classifier.start();

		expect(writes.join("")).toContain("vision model loading 0%");
		expect(writes.join("")).toContain("classifier model loading 0%");
		expect(writes.join("")).toContain("\x1b[1F\x1b[J");

		vision.done();
		classifier.done();
		const finalRows = writes.slice(-2).join("");
		expect(finalRows).toContain("vision model ready");
		expect(finalRows).toContain("classifier model ready");
	});
});
