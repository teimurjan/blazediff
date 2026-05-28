import { describe, expect, it } from "vitest";
import {
	CODING_AGENT_STACKS,
	parseStackList,
	STACKS,
} from "../../src/onboard/stacks";

describe("parseStackList", () => {
	it("parses a single coding-agent stack", () => {
		expect(parseStackList("claude")).toEqual(["claude"]);
	});

	it("parses a comma-separated list and dedupes", () => {
		expect(parseStackList("claude,codex,claude")).toEqual(["claude", "codex"]);
	});

	it('expands "all" to the coding-agent stacks (no local)', () => {
		expect(parseStackList("all")).toEqual([...CODING_AGENT_STACKS]);
		expect(parseStackList("all")).not.toContain("local");
	});

	it("parses local on its own", () => {
		expect(parseStackList("local")).toEqual(["local"]);
	});

	it("rejects combining local with a coding-agent stack", () => {
		expect(() => parseStackList("local,claude")).toThrow(/cannot be combined/);
	});

	it('rejects combining "all" with another stack', () => {
		expect(() => parseStackList("all,local")).toThrow(/cannot be combined/);
	});

	it("rejects unknown stacks", () => {
		expect(() => parseStackList("bogus")).toThrow(/unknown stack/);
	});

	it("is case-insensitive and trims whitespace", () => {
		expect(parseStackList(" Claude , CURSOR ")).toEqual(["claude", "cursor"]);
	});
});

describe("STACKS metadata", () => {
	it("maps coding-agent stacks to the host judge and a skill install", () => {
		for (const id of CODING_AGENT_STACKS) {
			expect(STACKS[id].judge).toBe("host");
			expect(STACKS[id].kind).toBe("skill-install");
			expect(STACKS[id].target).toBeTypeOf("function");
		}
	});

	it("maps local to the local judge with no skill target", () => {
		expect(STACKS.local.judge).toBe("local");
		expect(STACKS.local.kind).toBe("local-judge");
		expect(STACKS.local.target).toBeUndefined();
	});
});
