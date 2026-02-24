import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getOrCreateSnapshot, terminateWorker } from "@blazediff/matcher";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");
const TEMP_DIR = join(__dirname, "__perf_test_snapshots__");

function createTestContext(testName: string) {
	return {
		testPath: join(TEMP_DIR, "perf.test.ts"),
		testName,
	};
}

describe("Performance", () => {
	beforeAll(() => {
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEMP_DIR, { recursive: true });
	});

	afterAll(async () => {
		await terminateWorker();
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true, force: true });
		}
	});

	it("first run: should create snapshot quickly", async () => {
		const pngBuffer = readFileSync(join(FIXTURES_PATH, "pixelmatch/1a.png"));

		const start = performance.now();
		const result = await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: TEMP_DIR },
			createTestContext("first-run"),
		);
		const elapsed = performance.now() - start;

		expect(result.pass).toBe(true);
		expect(result.snapshotStatus).toBe("added");
		expect(elapsed).toBeLessThan(100);
	});

	it("comparison run: should compare quickly", async () => {
		const pngBuffer = readFileSync(join(FIXTURES_PATH, "pixelmatch/1a.png"));

		// Create baseline
		await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: TEMP_DIR },
			createTestContext("comparison"),
		);

		// Measure comparison
		const start = performance.now();
		const result = await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: TEMP_DIR },
			createTestContext("comparison"),
		);
		const elapsed = performance.now() - start;

		expect(result.pass).toBe(true);
		expect(result.snapshotStatus).toBe("matched");
		expect(elapsed).toBeLessThan(150);
	});
});
