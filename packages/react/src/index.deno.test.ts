import { assertEquals } from "jsr:@std/assert";

// Minimal DOM polyfill — @blazediff/ui modules (imported transitively by
// @blazediff/react components) extend HTMLElement at load time.
class FakeHTMLElement {}
Object.assign(globalThis, {
	HTMLElement: FakeHTMLElement,
	customElements: { define: () => {}, get: () => undefined },
});

Deno.test("react: component exports are functions", async () => {
	const mod = await import("./index.ts");
	assertEquals(typeof mod.DifferenceMode, "function");
	assertEquals(typeof mod.SwipeMode, "function");
	assertEquals(typeof mod.TwoUpMode, "function");
	assertEquals(typeof mod.OnionSkinMode, "function");
});
