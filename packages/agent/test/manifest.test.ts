import { describe, expect, it } from "vitest";
import {
	childrenOf,
	findOrphanedSubEntries,
	isDerived,
	isEntryStale,
	makeEntry,
	subNameOf,
} from "../src/manifest";
import type { Manifest } from "../src/types";

describe("makeEntry derived entries", () => {
	it("encodes parent/derived and uses the derived id for the baseline path", () => {
		const entry = makeEntry({
			id: "weather__menu",
			url: "/weather",
			parent: "weather",
			derived: true,
			subName: "menu",
		});
		expect(entry.parent).toBe("weather");
		expect(entry.derived).toBe(true);
		expect(entry.baselinePath).toBe(".blazediff/baselines/weather__menu.png");
		expect(isDerived(entry)).toBe(true);
		expect(subNameOf(entry)).toBe("menu");
	});

	it("folds harness refs into the capture hash", () => {
		const a = makeEntry({
			id: "x",
			url: "/x",
			harnesses: [{ name: "auth", params: { persona: "a" } }],
		});
		const b = makeEntry({
			id: "x",
			url: "/x",
			harnesses: [{ name: "auth", params: { persona: "b" } }],
		});
		expect(a.captureHash).not.toBe(b.captureHash);
	});

	it("is order- and key-independent for harness params", () => {
		const a = makeEntry({
			id: "x",
			url: "/x",
			harnesses: [{ name: "auth", params: { a: 1, b: 2 } }],
		});
		const b = makeEntry({
			id: "x",
			url: "/x",
			harnesses: [{ name: "auth", params: { b: 2, a: 1 } }],
		});
		expect(a.captureHash).toBe(b.captureHash);
	});
});

describe("isEntryStale", () => {
	it("flips when a harness ref changes", () => {
		const entry = makeEntry({
			id: "x",
			url: "/x",
			harnesses: [{ name: "menu" }],
		});
		expect(isEntryStale(entry)).toBe(false);
		const edited = { ...entry, harnesses: [{ name: "other" }] };
		expect(isEntryStale(edited)).toBe(true);
	});
});

describe("childrenOf / findOrphanedSubEntries", () => {
	const manifest: Manifest = {
		version: 1,
		configHash: "",
		stabilityHooksVersion: 1,
		entries: [
			makeEntry({ id: "weather", url: "/weather", harnesses: [{ name: "m" }] }),
			makeEntry({
				id: "weather__menu",
				url: "/weather",
				parent: "weather",
				derived: true,
				subName: "menu",
			}),
			makeEntry({
				id: "ghost__menu",
				url: "/ghost",
				parent: "ghost",
				derived: true,
				subName: "menu",
			}),
		],
	};

	it("lists children of a base entry", () => {
		expect(childrenOf(manifest, "weather").map((e) => e.id)).toEqual([
			"weather__menu",
		]);
	});

	it("finds derived entries whose parent is gone", () => {
		expect(findOrphanedSubEntries(manifest).map((e) => e.id)).toEqual([
			"ghost__menu",
		]);
	});
});
