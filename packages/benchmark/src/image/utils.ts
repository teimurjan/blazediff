import { readdirSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import { shuffleArray } from "../utils";
import type { BenchmarkArgs, ImagePair, ImagePairLoaded } from "./types";

export function getImagePairs(
	fixturesDir: string,
	fixturesSubDir: string,
): Array<ImagePair> {
	const pairs: Array<ImagePair> = [];

	// Look for pairs like 1a.png, 1b.png
	const dir = join(fixturesDir, fixturesSubDir);
	const files = readdirSync(dir);
	const pngFiles = files.filter((f: string) => f.endsWith(".png"));

	const pairMap = new Map<string, { a?: string; b?: string }>();

	for (const file of pngFiles) {
		const baseName = file.replace(/[ab]\.png$/, "");
		if (!pairMap.has(baseName)) {
			pairMap.set(baseName, {});
		}

		const pair = pairMap.get(baseName);
		if (!pair) {
			continue;
		}
		if (file.endsWith("a.png")) {
			pair.a = file;
		} else if (file.endsWith("b.png")) {
			pair.b = file;
		}
	}

	for (const [name, pair] of pairMap) {
		if (pair.a && pair.b) {
			pairs.push({
				a: join(fixturesDir, fixturesSubDir, pair.a),
				b: join(fixturesDir, fixturesSubDir, pair.b),
				name: `${fixturesSubDir}/${name}`,
			});
		}
	}

	return pairs;
}

export async function loadImagePairs(
	pairs: ImagePair[],
): Promise<ImagePairLoaded[]> {
	return Promise.all(
		pairs.map(async (pair) => {
			const { a, b, name } = pair;
			const [imageA, imageB] = await Promise.all([
				transformer.transform(a),
				transformer.transform(b),
			]);
			return {
				a: imageA,
				b: imageB,
				name,
			};
		}),
	);
}

export function parseBenchmarkArgs(): BenchmarkArgs {
	const args = process.argv.slice(2);
	const iterationsStr = args
		.find((arg) => arg.startsWith("--iterations="))
		?.split("=")[1];
	const iterations = iterationsStr ? parseInt(iterationsStr, 10) : 25;
	const target =
		args.find((arg) => arg.startsWith("--target="))?.split("=")[1] ??
		"blazediff";
	const variant =
		args.find((arg) => arg.startsWith("--variant="))?.split("=")[1] ??
		"algorithm";
	const format = (args
		.find((arg) => arg.startsWith("--format="))
		?.split("=")[1] ?? "markdown") as "markdown" | "json" | undefined;
	const output =
		args.find((arg) => arg.startsWith("--output="))?.split("=")[1] ?? "console";

	return { iterations, target, variant, format, output };
}

export const getBenchmarkImagePairs = (): Array<ImagePair> => {
	const fourKImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "4k"),
	);
	const pixelmatchImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "pixelmatch"),
	);
	const blazediffImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "blazediff"),
	);
	const pageImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "page"),
	);
	const sameImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "same"),
	);

	const pairs = [
		...pixelmatchImagePairs,
		...blazediffImagePairs,
		...fourKImagePairs,
		...pageImagePairs,
		...sameImagePairs,
	];

	// Identical have equal metadata, while same pairs are visually identical
	const identicalPairs: ImagePair[] = [];
	for (const pair of pairs) {
		identicalPairs.push({
			a: pair.a,
			b: pair.a,
			name: `${pair.name} (identical)`,
		});
	}
	pairs.push(...identicalPairs);

	shuffleArray(pairs);

	return pairs;
};

export const getStructureBenchmarkImagePairs = (): Array<ImagePair> => {
	const pixelmatchImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "pixelmatch"),
	);
	const blazediffImagePairs = shuffleArray(
		getImagePairs(join(__dirname, "../../../fixtures"), "blazediff"),
	);
	const pairs = [
		...pixelmatchImagePairs,
		...blazediffImagePairs,
	];

	// Identical have equal metadata, while same pairs are visually identical
	const identicalPairs: ImagePair[] = [];
	for (const pair of pairs) {
		identicalPairs.push({
			a: pair.a,
			b: pair.a,
			name: `${pair.name} (identical)`,
		});
	}
	pairs.push(...identicalPairs);

	shuffleArray(pairs);

	return pairs;
};
