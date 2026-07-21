import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import type { Output } from "../../src/cli/output";
import { createDevServerProgress } from "../../src/cli/render/server";

const humanOutput: Output = {
	isJson: () => false,
	isQuiet: () => false,
	isTTY: () => false,
	emit() {},
};

describe("createDevServerProgress", () => {
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

	it("reports checking and startup before the server becomes ready", () => {
		const progress = createDevServerProgress(humanOutput, {
			command: "pnpm dev",
			port: 3000,
			logPath: "/repo/.blazediff/server.log",
		});

		progress.checking();
		expect(writes.at(-1)).toContain(
			"checking dev server http://127.0.0.1:3000",
		);

		progress.starting();
		expect(writes.at(-1)).toContain("starting dev server");
		expect(writes.at(-1)).toContain("command: pnpm dev");
		expect(writes.at(-1)).toContain("waiting: http://127.0.0.1:3000");

		vi.advanceTimersByTime(10_000);
		expect(writes.at(-1)).toContain("dev server: still starting");
		expect(writes.at(-1)).toContain("10.0s");

		progress.ready(false);
		expect(writes.at(-1)).toContain("dev server ready");
		expect(writes.at(-1)).not.toContain("serve-status --kill");
	});

	it("distinguishes an attached server and a startup failure", () => {
		const attached = createDevServerProgress(humanOutput, {
			command: "pnpm dev",
			port: 3000,
			logPath: "/repo/.blazediff/server.log",
		});
		attached.checking();
		attached.ready(true);
		expect(writes.at(-1)).toContain("dev server already running");

		const failed = createDevServerProgress(humanOutput, {
			command: "pnpm dev",
			port: 3001,
			logPath: "/repo/.blazediff/server.log",
		});
		failed.checking();
		failed.starting();
		failed.failed();
		expect(writes.at(-1)).toContain("dev server failed");
		expect(writes.at(-1)).toContain("server.log");
	});

	it("does not corrupt JSON output with human progress", () => {
		const progress = createDevServerProgress(
			{ ...humanOutput, isJson: () => true },
			{
				command: "pnpm dev",
				port: 3000,
				logPath: "/repo/.blazediff/server.log",
			},
		);
		progress.checking();
		progress.starting();
		progress.ready(false);
		expect(writes).toEqual([]);
	});
});
