import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	getOrCreateSnapshot,
	terminateWorker,
} from "@blazediff/matcher";
import { toMatchImageSnapshot as jestImageSnapshotMatcher } from "jest-image-snapshot";

expect.extend({ toMatchImageSnapshotJIS: jestImageSnapshotMatcher });

declare global {
	namespace jest {
		interface Matchers<R> {
			toMatchImageSnapshotJIS(options?: {
				customSnapshotsDir?: string;
				customSnapshotIdentifier?: () => string;
				failureThreshold?: number;
				failureThresholdType?: "pixel" | "percent";
			}): R;
		}
	}
}

const FIXTURES_PATH = join(__dirname, "../../../fixtures");
const TEMP_DIR = join(__dirname, "__perf_test_snapshots__");
const BLAZEDIFF_DIR = join(TEMP_DIR, "blazediff");
const JEST_IMAGE_SNAPSHOT_DIR = join(TEMP_DIR, "jest-image-snapshot");

function createTestContext(testName: string) {
	return {
		testPath: join(TEMP_DIR, "perf.test.ts"),
		testName,
	};
}

describe("Performance: blazediff vs jest-image-snapshot", () => {
	beforeAll(() => {
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true, force: true });
		}
		mkdirSync(BLAZEDIFF_DIR, { recursive: true });
		mkdirSync(JEST_IMAGE_SNAPSHOT_DIR, { recursive: true });
	});

	afterAll(async () => {
		await terminateWorker();
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true, force: true });
		}
	});

	it("first run: blazediff should be faster or equal", async () => {
		const pngBuffer = readFileSync(join(FIXTURES_PATH, "pixelmatch/1a.png"));

		// Measure jest-image-snapshot first to avoid any warm-up advantage
		const jisStart = performance.now();
		expect(pngBuffer).toMatchImageSnapshotJIS({
			customSnapshotsDir: JEST_IMAGE_SNAPSHOT_DIR,
			customSnapshotIdentifier: () => "first-run-jis",
		});
		const jisTime = performance.now() - jisStart;

		const blazediffStart = performance.now();
		await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: BLAZEDIFF_DIR },
			createTestContext("first-run-blazediff"),
		);
		const blazediffTime = performance.now() - blazediffStart;

		expect(blazediffTime).toBeLessThanOrEqual(jisTime);
	});

	it("comparison run: blazediff should be faster or equal", async () => {
		const pngBuffer = readFileSync(join(FIXTURES_PATH, "pixelmatch/1a.png"));

		// Create baselines first
		await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: BLAZEDIFF_DIR },
			createTestContext("comparison-blazediff"),
		);
		expect(pngBuffer).toMatchImageSnapshotJIS({
			customSnapshotsDir: JEST_IMAGE_SNAPSHOT_DIR,
			customSnapshotIdentifier: () => "comparison-jis",
		});

		// Measure jest-image-snapshot first to avoid warm cache advantage
		const jisStart = performance.now();
		expect(pngBuffer).toMatchImageSnapshotJIS({
			customSnapshotsDir: JEST_IMAGE_SNAPSHOT_DIR,
			customSnapshotIdentifier: () => "comparison-jis",
		});
		const jisTime = performance.now() - jisStart;

		// Then measure blazediff
		const blazediffStart = performance.now();
		await getOrCreateSnapshot(
			pngBuffer,
			{ method: "core", snapshotsDir: BLAZEDIFF_DIR },
			createTestContext("comparison-blazediff"),
		);
		const blazediffTime = performance.now() - blazediffStart;

		expect(blazediffTime).toBeLessThanOrEqual(jisTime);
	});
});
