import { describe, expect, it } from "vitest";
import { collapseTemplates } from "../../src/discover/templates";
import type { DiscoveredRoute } from "../../src/types";

const route = (url: string): DiscoveredRoute => ({ url, source: "crawl" });

describe("collapseTemplates", () => {
	it("samples large sibling groups under a non-root parent", () => {
		const blog = Array.from({ length: 12 }, (_, i) => route(`/blog/post-${i}`));
		const { routes, collapsed } = collapseTemplates([route("/"), ...blog]);

		const kept = routes.filter((r) => r.url.startsWith("/blog/"));
		expect(kept).toEqual([route("/blog/post-0"), route("/blog/post-1")]);
		expect(routes).toContainEqual(route("/"));
		expect(collapsed).toEqual(["/blog/* (12 → 2)"]);
	});

	it("leaves root-level pages and small groups intact", () => {
		const input = [
			route("/"),
			route("/about"),
			route("/pricing"),
			route("/contact"),
			route("/docs/intro"),
			route("/docs/setup"),
		];
		const { routes, collapsed } = collapseTemplates(input);

		expect(routes).toEqual(input);
		expect(collapsed).toEqual([]);
	});

	it("honors custom threshold and sample count", () => {
		const items = Array.from({ length: 4 }, (_, i) => route(`/items/${i}`));
		const { routes, collapsed } = collapseTemplates([route("/"), ...items], {
			threshold: 3,
			samples: 1,
		});

		const kept = routes.filter((r) => r.url.startsWith("/items/"));
		expect(kept).toEqual([route("/items/0")]);
		expect(collapsed).toEqual(["/items/* (4 → 1)"]);
	});

	it("preserves order of the surviving routes", () => {
		const input = [
			route("/a"),
			...Array.from({ length: 6 }, (_, i) => route(`/items/${i}`)),
			route("/z"),
		];
		const { routes } = collapseTemplates(input);

		expect(routes.map((r) => r.url)).toEqual([
			"/a",
			"/items/0",
			"/items/1",
			"/z",
		]);
	});
});
