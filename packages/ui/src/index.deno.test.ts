import { assertEquals } from "jsr:@std/assert";

// ui modules extend HTMLElement at the top level; under Deno we need a stub.
class FakeHTMLElement {
	className = "";
	getAttribute(_: string): string | null {
		return null;
	}
	addEventListener(): void {}
	removeEventListener(): void {}
}

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

Deno.test("ui: BaseElement extends the HTMLElement polyfill", () =>
	withDomPolyfill(async () => {
		const { BaseElement } = await import("./base-element.ts");
		assertEquals(typeof BaseElement, "function");
		const Derived = class extends BaseElement {};
		assertEquals(new Derived() instanceof FakeHTMLElement, true);
	}));
