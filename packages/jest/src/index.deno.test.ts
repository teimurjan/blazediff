import { assertEquals } from "jsr:@std/assert";

// Stub the global `expect` so importing @blazediff/jest (which calls
// expect.extend at module top — normally supplied by Jest's runtime) doesn't
// crash under Deno.
(globalThis as unknown as { expect: { extend: (m: unknown) => void } }).expect =
	{ extend: () => {} };

Deno.test("jest plugin: setupBlazediffMatchers is exported", async () => {
	const mod = await import("./index.ts");
	assertEquals(typeof mod.setupBlazediffMatchers, "function");
	assertEquals(typeof mod.default, "function");
});
