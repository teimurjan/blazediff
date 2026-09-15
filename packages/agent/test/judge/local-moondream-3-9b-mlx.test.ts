import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStationVisionRunner } from "../../src/judge/local-moondream-3-9b-mlx";

const QUESTION = "Read the text in this image.";

let dir: string;
let imagePath: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "bd-station-"));
	imagePath = path.join(dir, "crop.png");
	await writeFile(imagePath, Buffer.from([1, 2, 3]));
});

afterEach(async () => {
	vi.unstubAllGlobals();
	await rm(dir, { recursive: true, force: true });
});

function stubFetch(response: Response) {
	const fetchMock = vi.fn().mockResolvedValue(response);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status });

describe("createStationVisionRunner", () => {
	it("posts the image as a data URL and returns the trimmed answer", async () => {
		const fetchMock = stubFetch(jsonResponse({ answer: '  "Choose Pro"  ' }));

		const answer = await createStationVisionRunner(
			"http://localhost:2020/v1/",
		).describe(imagePath, QUESTION);

		expect(answer).toBe('"Choose Pro"');
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:2020/v1/query");
		expect(JSON.parse(init.body)).toMatchObject({
			image_url: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`,
			question: QUESTION,
			stream: false,
		});
	});

	it("throws when the station returns a non-OK status", async () => {
		stubFetch(jsonResponse({}, 503));

		await expect(
			createStationVisionRunner("http://localhost:2020/v1").describe(
				imagePath,
				QUESTION,
			),
		).rejects.toThrow("503");
	});

	it("throws when the station reports an error payload", async () => {
		stubFetch(jsonResponse({ error: "Request timeout" }));

		await expect(
			createStationVisionRunner("http://localhost:2020/v1").describe(
				imagePath,
				QUESTION,
			),
		).rejects.toThrow("Request timeout");
	});
});
