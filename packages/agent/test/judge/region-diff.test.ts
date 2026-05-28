import { describe, expect, it } from "vitest";
import {
	describeRegionChange,
	diffTokens,
	extractQuoted,
	tokenize,
} from "../../src/judge/region-diff";

describe("extractQuoted", () => {
	it("pulls the longest quoted span out of Moondream prose", () => {
		expect(
			extractQuoted('The word " Nimbus 123" is written on a white background.'),
		).toBe("Nimbus 123");
	});

	it("returns null when nothing is quoted", () => {
		expect(extractQuoted("Nimbus on a white background")).toBeNull();
	});
});

describe("diffTokens", () => {
	it("reports inserted and removed tokens around a shared scaffold", () => {
		const d = diffTokens(tokenize("Nimbus"), tokenize("Nimbus 123"));
		expect(d.inserted).toEqual(["123"]);
		expect(d.removed).toEqual([]);
	});
});

describe("describeRegionChange", () => {
	// The real reads Moondream produced for the Nimbus → Nimbus 123 logo change.
	it("isolates the added text from two noisy quoted reads", () => {
		const out = describeRegionChange(
			"addition",
			'The word " Nimbus" is written on a white background using blue ink. There are no other objects visible.',
			'The word " Nimbus 123" is written on a white background.',
		);
		expect(out).toContain('added "123"');
		expect(out).toContain("Nimbus 123");
	});

	it("strips scene words from a prose fallback diff (no quotes)", () => {
		const out = describeRegionChange(
			"addition",
			"shows Nimbus on a white background",
			"shows Nimbus 123 on a white background",
		);
		expect(out).toBe('added "123"');
	});

	it("reports removals for a deletion", () => {
		const out = describeRegionChange(
			"deletion",
			'the button reads "Save Changes"',
			'the button reads "Save"',
		);
		expect(out).toContain('removed "changes"');
	});

	it("falls back to a neutral phrase when reads match", () => {
		const out = describeRegionChange(
			"color-change",
			'the heading reads "Pricing"',
			'the heading reads "Pricing"',
		);
		expect(out).toContain("color change");
		expect(out).toContain("no readable text change");
	});
});
