import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../../fixtures/blazediff");
const dataPath = path.resolve(
	__dirname,
	"../data/interpret/blazediff-3-diff.json",
);
const outDir = path.resolve(__dirname, "../data/launch");
const outPath = path.join(outDir, "hero-diff.png");

const interpretData = JSON.parse(readFileSync(dataPath, "utf8"));

const DISPLAY_WIDTH = 1440;
const OFFSET = 112;
const BORDER = 4;

const LABEL_FONT_SIZE = 40;
const LABEL_CHIP_HEIGHT = 72;
const LABEL_PAD_X = 28;
const LABEL_INSET = 32;

const aspect = interpretData.width / interpretData.height;
const imgHeight = Math.ceil(DISPLAY_WIDTH / aspect);
const canvasWidth = DISPLAY_WIDTH + OFFSET;
const canvasHeight = imgHeight + OFFSET;

const canvas = createCanvas(canvasWidth, canvasHeight);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#0a0a0f";
ctx.fillRect(0, 0, canvasWidth, canvasHeight);

const drawBorderedImage = (img, x, y) => {
	ctx.globalAlpha = 0.9;
	ctx.drawImage(img, x, y, DISPLAY_WIDTH, imgHeight);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = "#2a2a38";
	ctx.lineWidth = BORDER;
	ctx.strokeRect(
		x + BORDER / 2,
		y + BORDER / 2,
		DISPLAY_WIDTH - BORDER,
		imgHeight - BORDER,
	);
};

const drawChip = (label, x, y) => {
	ctx.font = `${LABEL_FONT_SIZE}px 'JetBrains Mono', monospace`;
	const metrics = ctx.measureText(label);
	const chipWidth = metrics.width + LABEL_PAD_X * 2;
	ctx.fillStyle = "rgba(21, 21, 28, 0.9)";
	ctx.fillRect(x, y, chipWidth, LABEL_CHIP_HEIGHT);
	ctx.strokeStyle = "#2a2a38";
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, y + 0.5, chipWidth - 1, LABEL_CHIP_HEIGHT - 1);
	ctx.fillStyle = "#7a7585";
	ctx.textBaseline = "middle";
	ctx.textAlign = "left";
	ctx.fillText(label, x + LABEL_PAD_X, y + LABEL_CHIP_HEIGHT / 2);
};

const imgA = await loadImage(path.join(fixturesDir, "3a.png"));
const imgB = await loadImage(path.join(fixturesDir, "3b.png"));

drawBorderedImage(imgA, OFFSET, 0);

ctx.save();
ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
ctx.shadowBlur = 64;
ctx.shadowOffsetX = -16;
ctx.shadowOffsetY = -16;
ctx.fillStyle = "#0a0a0f";
ctx.fillRect(0, OFFSET, DISPLAY_WIDTH, imgHeight);
ctx.restore();

drawBorderedImage(imgB, 0, OFFSET);

const scaleX = DISPLAY_WIDTH / interpretData.width;
const scaleY = imgHeight / interpretData.height;
for (const region of interpretData.regions) {
	const rx = region.bbox.x * scaleX;
	const ry = OFFSET + region.bbox.y * scaleY;
	const rw = region.bbox.width * scaleX;
	const rh = region.bbox.height * scaleY;
	ctx.fillStyle = "rgba(255, 46, 139, 0.18)";
	ctx.fillRect(rx, ry, rw, rh);
	ctx.strokeStyle = "#ff2e8b";
	ctx.lineWidth = 4;
	ctx.strokeRect(rx, ry, rw, rh);
}

drawChip("BASELINE", OFFSET + LABEL_INSET, LABEL_INSET);
drawChip("CURRENT", LABEL_INSET, OFFSET + LABEL_INSET);

mkdirSync(outDir, { recursive: true });
const buffer = await canvas.encode("png");
writeFileSync(outPath, buffer);
console.log(`Generated ${outPath} (${canvasWidth}x${canvasHeight})`);
