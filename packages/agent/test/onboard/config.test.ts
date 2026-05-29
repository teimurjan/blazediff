import { describe, expect, it } from "vitest";
import type { DevScriptCandidate } from "../../src/introspect/package";
import { chooseDevScript } from "../../src/onboard/config";

const candidate = (name: string): DevScriptCandidate => ({
	name,
	body: `${name} script`,
	command: `yarn ${name}`,
	port: 3000,
});

const dev = candidate("dev");
const start = candidate("start");

describe("chooseDevScript", () => {
	it("returns the only candidate without prompting", async () => {
		expect(await chooseDevScript([dev], {}, true)).toBe(dev);
	});

	it("defaults to the highest-priority candidate when non-interactive (no throw)", async () => {
		expect(await chooseDevScript([dev, start], {}, false)).toBe(dev);
	});

	it("honors --dev-script", async () => {
		expect(
			await chooseDevScript([dev, start], { devScript: "start" }, false),
		).toBe(start);
	});

	it("throws when --dev-script names an unknown candidate", async () => {
		await expect(
			chooseDevScript([dev, start], { devScript: "serve" }, false),
		).rejects.toThrow(/not found among candidates/);
	});
});
