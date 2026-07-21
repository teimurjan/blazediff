import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgress } from "../../src/cli/render/progress";
import type { CheckResult } from "../../src/types";

function pass(id: string): CheckResult {
	return { id, url: `/${id}`, status: "pass" };
}

function fail(id: string): CheckResult {
	return { id, url: `/${id}`, status: "fail", diffPercentage: 0.01 };
}
function hasCursorUp(output: string): boolean {
	return output.split("\x1b[").some((part) => /^\d+F/.test(part));
}

describe("createProgress", () => {
	let writes: string[];
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
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
	});

	describe("non-TTY", () => {
		it("announces each phase once and prints terminal results", () => {
			const view = createProgress({ interactive: false });
			view.emit({ type: "capturing", entryId: "a", url: "/a" });
			view.emit({ type: "capturing", entryId: "b", url: "/b" });
			view.emit({ type: "captured", entryId: "a" });
			view.emit({ type: "capture-complete", captured: 2, total: 2 });
			view.emit({ type: "diffing", entryId: "a", url: "/a" });
			view.emit({ type: "diffing", entryId: "b", url: "/b" });
			view.emit({ type: "judging", entryId: "a", url: "/a" });
			view.emit({ type: "judging", entryId: "b", url: "/b" });
			view.emit({ type: "result", result: pass("a") });
			view.emit({ type: "result", result: pass("a") });

			const output = writes.join("");
			expect(output).not.toContain("\x1b[");
			expect(output.match(/capturing/g)).toHaveLength(1);
			expect(output.match(/comparing/g)).toHaveLength(1);
			expect(output.match(/judging/g)).toHaveLength(1);
			expect(output.match(/✓ a/g)).toHaveLength(1);
			expect(output).toContain("capture complete");
		});

		it("prints an interrupt once as a terminal event", () => {
			const view = createProgress({ interactive: false });
			const interrupt = {
				type: "interrupt" as const,
				interrupt: {
					kind: "host-judgment-required" as const,
					entryId: "home",
					url: "/home",
					requestPath: ".blazediff/judgments/home",
					signature: "sig",
					pendingResult: {
						id: "home",
						url: "/home",
						status: "needs-judgment" as const,
					},
				},
			};
			view.emit({ type: "judging", entryId: "home", url: "/home" });
			view.emit(interrupt);
			view.emit(interrupt);

			expect(writes).toHaveLength(2);
			expect(writes.at(-1)).toContain("awaiting judgment");
		});
	});

	describe("interactive", () => {
		it("replaces one transient line through capture and comparison", () => {
			const view = createProgress({ interactive: true });
			view.emit({ type: "capturing", entryId: "home", url: "/home" });
			view.emit({ type: "captured", entryId: "home" });
			expect(writes).toHaveLength(2);
			expect(writes.at(-1)).toContain("captured");

			view.emit({ type: "capture-complete", captured: 1, total: 1 });
			expect(writes.at(-1)).toContain("capture complete");

			view.emit({ type: "diffing", entryId: "home", url: "/home" });
			expect(writes.at(-1)).toContain("comparing");
			expect(hasCursorUp(writes.join(""))).toBe(false);
		});

		it("clears the transient line and prints each result once", () => {
			const view = createProgress({ interactive: true });
			view.emit({ type: "judging", entryId: "home", url: "/home" });
			view.emit({ type: "result", result: fail("home") });
			const writesAfterResult = writes.length;
			view.emit({ type: "result", result: fail("home") });

			expect(writes).toHaveLength(writesAfterResult);
			expect(writes.at(-1)).toContain("home");
			expect(writes.at(-1)).not.toContain("judging");
			expect(writes.at(-1)).toMatch(/\n$/);
		});

		it("does constant work per event instead of redrawing every row", () => {
			const view = createProgress({ interactive: true });
			for (let index = 0; index < 30; index += 1) {
				view.emit({
					type: "judging",
					entryId: `page-${index}`,
					url: `/page-${index}`,
				});
			}

			expect(writes).toHaveLength(30);
			expect(writes.every((write) => !write.includes("\n"))).toBe(true);
			expect(hasCursorUp(writes.join(""))).toBe(false);
			expect(writes.at(-1)).toContain("page-29");
		});
	});
});
