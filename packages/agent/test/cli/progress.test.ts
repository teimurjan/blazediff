import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgress } from "../../src/cli/render/progress";
import type { CheckResult } from "../../src/types";

function pass(id: string): CheckResult {
	return { id, url: `/${id}`, status: "pass" };
}

function fail(id: string): CheckResult {
	return { id, url: `/${id}`, status: "fail", diffPercentage: 0.01 };
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

	describe("non-TTY (append-only)", () => {
		it("emits exactly one line per test (the terminal result) with no ANSI escapes", () => {
			const view = createProgress({ interactive: false });
			view.emit({ type: "captured", entryId: "home" });
			view.emit({ type: "judging", entryId: "home", url: "/home" });
			view.emit({ type: "result", result: pass("home") });

			// Captured and judging are both suppressed in non-TTY — captured because
			// the result line would duplicate the page, judging because without
			// ANSI we can't overwrite it with the result.
			expect(writes).toHaveLength(1);
			expect(writes.join("")).not.toContain("\x1b[");
			expect(writes.join("")).not.toContain("judging");
			expect(writes.join("")).not.toContain("captured");
			expect(writes[0]).toContain("home");
		});

		it("interrupts still print as a terminal event", () => {
			const view = createProgress({ interactive: false });
			view.emit({ type: "judging", entryId: "home", url: "/home" });
			view.emit({
				type: "interrupt",
				interrupt: {
					kind: "host-judgment-required",
					entryId: "home",
					url: "/home",
					requestPath: ".blazediff/judgments/home",
					signature: "sig",
					pendingResult: {
						id: "home",
						url: "/home",
						status: "needs-judgment",
					},
				},
			});

			expect(writes).toHaveLength(1);
			expect(writes[0]).toContain("home");
			expect(writes[0]).toContain("awaiting judgment");
		});
	});

	describe("interactive (live redraw)", () => {
		it("replaces a judging row with its result in place", () => {
			const view = createProgress({ interactive: true });
			view.emit({ type: "judging", entryId: "home", url: "/home" });
			// First redraw draws the live region from scratch (no clear yet).
			expect(writes.some((w) => w.includes("\x1b[1F"))).toBe(false);
			expect(writes.at(-1)).toContain("judging");

			view.emit({ type: "result", result: fail("home") });
			// Second redraw clears the previous 1 line then writes the result.
			const clears = writes.filter((w) => w.includes("\x1b[1F"));
			expect(clears).toHaveLength(1);
			expect(writes.at(-1)).toContain("home");
			expect(writes.at(-1)).not.toContain("judging");
			// No `[N]` or `[N/total]` counter prefix anymore.
			expect(writes.at(-1)).not.toMatch(/\[\d+(\/\d+)?\]/);
		});

		it("redraws all in-flight rows on each event so completed rows stay positioned", () => {
			const view = createProgress({ interactive: true });
			view.emit({ type: "judging", entryId: "a", url: "/a" });
			view.emit({ type: "judging", entryId: "b", url: "/b" });
			// On the second judging emit, the view should clear the previous
			// region (1 line) and redraw both rows.
			const lastWrites = writes.slice(-3);
			expect(lastWrites[0]).toContain("\x1b[1F");
			expect(lastWrites[1]).toContain("a");
			expect(lastWrites[2]).toContain("b");

			view.emit({ type: "result", result: pass("a") });
			// `a` becomes result, `b` stays as judging; both lines still drawn.
			const tail = writes.slice(-3);
			expect(tail[0]).toContain("\x1b[2F"); // clear the 2-line region
			expect(tail[1]).toContain("a");
			expect(tail[1]).not.toContain("judging");
			expect(tail[2]).toContain("judging"); // b still judging
		});
	});
});
