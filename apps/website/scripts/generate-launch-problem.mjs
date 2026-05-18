import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../../fixtures/blazediff");
const interpretDir = path.resolve(__dirname, "../data/interpret");
const outDir = path.resolve(__dirname, "../data/launch");
const outPath = path.join(outDir, "problem-stack.png");

const loadInterpret = (n) =>
	JSON.parse(
		readFileSync(path.join(interpretDir, `blazediff-${n}-diff.json`), "utf8"),
	);

const CANVAS_W = 1200;
const CANVAS_H = 1400;

const BG = "transparent";
const BORDER = "#2a2a38";
const REGION_FILL = "#ff0000";
const REGION_STROKE = "#ff0000";
const CHIP_BG = "rgba(21, 21, 28, 0.92)";
const CHIP_FG = "#7a7585";

const STACK = [
	{ n: 1, x: -80, y: 120, w: 880, rot: -8 },
	{ n: 4, x: 820, y: 60, w: 340, rot: -5 },
	{ n: 3, x: 60, y: 460, w: 720, rot: 5 },
	{ n: 2, x: 740, y: 880, w: 420, rot: 7 },
];

const imageCache = new Map();
const load = async (name) => {
	if (!imageCache.has(name)) {
		imageCache.set(name, await loadImage(path.join(fixturesDir, name)));
	}
	return imageCache.get(name);
};

const drawPair = async (ctx, card) => {
	const aFile = `${card.n}a.png`;
	const bFile = `${card.n}b.png`;
	const imgA = await load(aFile);
	const imgB = await load(bFile);
	const interpret = loadInterpret(card.n);

	const aspect = imgA.width / imgA.height;
	const imgW = card.w;
	const imgH = Math.round(imgW / aspect);
	const offset = Math.round(imgW * 0.08);
	const pairW = imgW + offset;
	const pairH = imgH + offset;
	const border = Math.max(2, Math.round(imgW * 0.004));

	ctx.save();
	ctx.translate(card.x + pairW / 2, card.y + pairH / 2);
	ctx.rotate((card.rot * Math.PI) / 180);

	// Lifted-paper shadow under the whole pair
	ctx.save();
	ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
	ctx.shadowBlur = 48;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 20;
	ctx.fillStyle = BG;
	ctx.fillRect(-pairW / 2, -pairH / 2, pairW, pairH);
	ctx.restore();

	// Baseline (top-right)
	const baseX = -pairW / 2 + offset;
	const baseY = -pairH / 2;
	ctx.globalAlpha = 0.9;
	ctx.drawImage(imgA, baseX, baseY, imgW, imgH);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = BORDER;
	ctx.lineWidth = border;
	ctx.strokeRect(
		baseX + border / 2,
		baseY + border / 2,
		imgW - border,
		imgH - border,
	);

	// Inner shadow gap so the current sits visibly "below" the baseline
	const curX = -pairW / 2;
	const curY = -pairH / 2 + offset;
	ctx.save();
	ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
	ctx.shadowBlur = Math.round(imgW * 0.05);
	ctx.shadowOffsetX = -Math.round(imgW * 0.012);
	ctx.shadowOffsetY = -Math.round(imgW * 0.012);
	ctx.fillStyle = BG;
	ctx.fillRect(curX, curY, imgW, imgH);
	ctx.restore();

	// Current (bottom-left)
	ctx.globalAlpha = 0.9;
	ctx.drawImage(imgB, curX, curY, imgW, imgH);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = BORDER;
	ctx.lineWidth = border;
	ctx.strokeRect(
		curX + border / 2,
		curY + border / 2,
		imgW - border,
		imgH - border,
	);

	// Real interpret region overlays on the current image
	const sx = imgW / interpret.width;
	const sy = imgH / interpret.height;
	for (const region of interpret.regions) {
		const rx = curX + region.bbox.x * sx;
		const ry = curY + region.bbox.y * sy;
		const rw = region.bbox.width * sx;
		const rh = region.bbox.height * sy;
		ctx.fillStyle = REGION_FILL;
		ctx.fillRect(rx, ry, rw, rh);
		ctx.strokeStyle = REGION_STROKE;
		ctx.lineWidth = border;
		ctx.strokeRect(rx, ry, rw, rh);
	}

	ctx.restore();
};

const canvas = createCanvas(CANVAS_W, CANVAS_H);
const ctx = canvas.getContext("2d");

ctx.fillStyle = BG;
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

for (const card of STACK) {
	await drawPair(ctx, card);
}

mkdirSync(outDir, { recursive: true });
const buffer = await canvas.encode("png");
writeFileSync(outPath, buffer);
console.log(`Generated ${outPath} (${CANVAS_W}x${CANVAS_H})`);
