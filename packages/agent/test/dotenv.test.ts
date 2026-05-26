import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnvFiles } from "../src/dotenv";

let dir: string;
const TOUCHED = [
	"BD_TEST_A",
	"BD_TEST_B",
	"BD_TEST_LOCAL",
	"BD_TEST_EXISTING",
	"BD_TEST_SCOPE",
];

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "blazediff-dotenv-"));
	await mkdir(path.join(dir, ".blazediff"), { recursive: true });
	for (const k of TOUCHED) delete process.env[k];
});

afterEach(async () => {
	for (const k of TOUCHED) delete process.env[k];
	if (dir) await rm(dir, { recursive: true, force: true });
});

describe("loadEnvFiles", () => {
	it("loads .env into process.env", async () => {
		await writeFile(path.join(dir, ".env"), "BD_TEST_A=one\nBD_TEST_B=two\n");
		const loaded = loadEnvFiles(dir);
		expect(process.env.BD_TEST_A).toBe("one");
		expect(process.env.BD_TEST_B).toBe("two");
		expect(loaded).toEqual([path.join(dir, ".env")]);
	});

	it("does not override an already-set variable", async () => {
		process.env.BD_TEST_EXISTING = "real";
		await writeFile(path.join(dir, ".env"), "BD_TEST_EXISTING=fromfile\n");
		loadEnvFiles(dir);
		expect(process.env.BD_TEST_EXISTING).toBe("real");
	});

	it(".env.local takes precedence over .env", async () => {
		await writeFile(path.join(dir, ".env"), "BD_TEST_LOCAL=base\n");
		await writeFile(path.join(dir, ".env.local"), "BD_TEST_LOCAL=local\n");
		loadEnvFiles(dir);
		expect(process.env.BD_TEST_LOCAL).toBe("local");
	});

	it(".blazediff/.env takes precedence over the project-root .env", async () => {
		await writeFile(path.join(dir, ".env"), "BD_TEST_SCOPE=root\n");
		await writeFile(
			path.join(dir, ".blazediff", ".env"),
			"BD_TEST_SCOPE=scoped\n",
		);
		loadEnvFiles(dir);
		expect(process.env.BD_TEST_SCOPE).toBe("scoped");
	});

	it("returns no files when none exist", () => {
		expect(loadEnvFiles(dir)).toEqual([]);
	});
});
