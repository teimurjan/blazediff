import { assertEquals } from "jsr:@std/assert";

class FakeHTMLElement {}

async function withDomPolyfill<T>(fn: () => Promise<T>): Promise<T> {
	const g = globalThis as Record<string, unknown>;
	const prev = {
		HTMLElement: g.HTMLElement,
		customElements: g.customElements,
	};
	g.HTMLElement = FakeHTMLElement;
	g.customElements = { define: () => {}, get: () => undefined };
	try {
		return await fn();
	} finally {
		g.HTMLElement = prev.HTMLElement;
		g.customElements = prev.customElements;
	}
}

Deno.test("react: component exports are functions", () =>
	withDomPolyfill(async () => {
		const mod = await import("./index.ts");
		assertEquals(typeof mod.DifferenceMode, "function");
		assertEquals(typeof mod.SwipeMode, "function");
		assertEquals(typeof mod.TwoUpMode, "function");
		assertEquals(typeof mod.OnionSkinMode, "function");
	}));
