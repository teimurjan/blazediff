import { assertEquals } from "jsr:@std/assert";

// Minimal DOM polyfill so ui modules — which extend HTMLElement at the top
// level — can be evaluated under Deno. In the browser these globals come
// from the runtime; here we stub only what the module body touches at load.
class FakeHTMLElement {
	className = "";
	getAttribute(_: string): string | null {
		return null;
	}
	addEventListener(): void {}
	removeEventListener(): void {}
}
Object.assign(globalThis, {
	HTMLElement: FakeHTMLElement,
	customElements: { define: () => {}, get: () => undefined },
});

Deno.test("ui: BaseElement extends the HTMLElement polyfill", async () => {
	const { BaseElement } = await import("./base-element.ts");
	assertEquals(typeof BaseElement, "function");
	const Derived = class extends BaseElement {};
	assertEquals(new Derived() instanceof FakeHTMLElement, true);
});
