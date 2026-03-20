import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { interpret } from "@blazediff/core-native";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data/interpret");
const fixturesDir = path.resolve(__dirname, "../../../fixtures/blazediff");

mkdirSync(dataDir, { recursive: true });

const pairs = [
	{ name: "blazediff-3-diff", a: "3a.png", b: "3b.png" },
	{ name: "blazediff-3-identical", a: "3a.png", b: "3a.png" },
];

for (const { name, a, b } of pairs) {
	const imgA = path.join(fixturesDir, a);
	const imgB = path.join(fixturesDir, b);

	const result = await interpret(imgA, imgB);

	const outPath = path.join(dataDir, `${name}.json`);
	writeFileSync(outPath, JSON.stringify(result, null, 2));
	console.log(`Generated ${outPath}`);
}
