import { assertEquals } from "jsr:@std/assert";

// @blazediff/jest calls expect.extend() at module top — normally Jest's
// runtime supplies `expect` as a global. Stub it only for the duration of
// the import, then restore whatever was there.
Deno.test("jest plugin: setupBlazediffMatchers is exported", async () => {
	const g = globalThis as Record<string, unknown>;
	const prev = g.expect;
	g.expect = { extend: () => {} };
	try {
		const mod = await import("./index.ts");
		assertEquals(typeof mod.setupBlazediffMatchers, "function");
		assertEquals(typeof mod.default, "function");
	} finally {
		if (prev === undefined) {
			delete g.expect;
		} else {
			g.expect = prev;
		}
	}
});
