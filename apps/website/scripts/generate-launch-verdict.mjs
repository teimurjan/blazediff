import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../data/launch");
const outPath = path.join(outDir, "verdict-summary.png");

const CANVAS_W = 1200;
const CANVAS_H = 1400;

const SURFACE = "#15151c";
const LINE = "#2a2a38";
const ACCENT = "#ff7a1a";
const FG = "#f0ece8";
const MUTED = "#7a7585";

const FRAME_INSET = 40;
const FRAME_X = FRAME_INSET;
const FRAME_Y = FRAME_INSET;
const FRAME_W = CANVAS_W - FRAME_INSET * 2;
const FRAME_H = CANVAS_H - FRAME_INSET * 2;
const PAD = 72;
const INNER_X = FRAME_X + PAD;
const INNER_W = FRAME_W - PAD * 2;
const ACCENT_BAR_H = 6;

const DIFFS = [
	{
		id: "01",
		label: "CONTRIBUTIONS",
		body: "new cell at week 38. fresh commit landed.",
		verdict: "INTENTIONAL",
	},
	{
		id: "02",
		label: "STOPWATCH",
		body: "00:00.21 -> 00:00.48. timer advanced.",
		verdict: "EXPECTED",
	},
	{
		id: "03",
		label: "MAP VIEW",
		body: "pins & labels shifted. routing data refreshed.",
		verdict: "INTENTIONAL",
	},
	{
		id: "04",
		label: "CALENDAR",
		body: '"today" pill 26 -> 29. date drift.',
		verdict: "EXPECTED",
	},
];

const canvas = createCanvas(CANVAS_W, CANVAS_H);
const ctx = canvas.getContext("2d");

// Surface
ctx.fillStyle = SURFACE;
ctx.fillRect(FRAME_X, FRAME_Y, FRAME_W, FRAME_H);

// Top accent bar
ctx.globalAlpha = 0.35;
ctx.fillStyle = ACCENT;
ctx.fillRect(FRAME_X, FRAME_Y, FRAME_W, ACCENT_BAR_H);
ctx.globalAlpha = 1;

// Frame border
ctx.strokeStyle = LINE;
ctx.lineWidth = 2;
ctx.strokeRect(FRAME_X + 1, FRAME_Y + 1, FRAME_W - 2, FRAME_H - 2);

const text = (str, x, y, opts = {}) => {
	const {
		font = "22px 'JetBrains Mono', monospace",
		color = FG,
		align = "left",
		baseline = "alphabetic",
	} = opts;
	ctx.font = font;
	ctx.textAlign = align;
	ctx.textBaseline = baseline;
	ctx.fillStyle = color;
	ctx.fillText(str, x, y);
};

const hr = (y) => {
	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(INNER_X, y);
	ctx.lineTo(INNER_X + INNER_W, y);
	ctx.stroke();
};

let y = FRAME_Y + 130;

text("VERDICT", INNER_X, y, {
	font: "28px 'JetBrains Mono', monospace",
	color: MUTED,
});

y += 90;
text("0 REGRESSIONS,", INNER_X, y, {
	font: "bold 84px 'JetBrains Mono', monospace",
	color: FG,
});

y += 100;
text("4 INTENTIONAL.", INNER_X, y, {
	font: "bold 84px 'JetBrains Mono', monospace",
	color: ACCENT,
});

y += 70;
text("CLAUDE ANALYZED THE QUEUE.", INNER_X, y, {
	font: "24px 'JetBrains Mono', monospace",
	color: MUTED,
});

y += 50;
hr(y);

y += 70;
for (const d of DIFFS) {
	text(`${d.id} - ${d.label}`, INNER_X, y, {
		font: "bold 28px 'JetBrains Mono', monospace",
		color: FG,
	});
	text(d.verdict, INNER_X + INNER_W, y, {
		font: "22px 'JetBrains Mono', monospace",
		color: ACCENT,
		align: "right",
	});
	y += 40;
	text(d.body, INNER_X, y, {
		font: "22px 'JetBrains Mono', monospace",
		color: MUTED,
	});
	y += 80;
}

y = FRAME_Y + FRAME_H - 100;
hr(y - 36);
text("rewrite baselines? > press enter", INNER_X, y, {
	font: "26px 'JetBrains Mono', monospace",
	color: ACCENT,
});

mkdirSync(outDir, { recursive: true });
const buffer = await canvas.encode("png");
writeFileSync(outPath, buffer);
console.log(`Generated ${outPath} (${CANVAS_W}x${CANVAS_H})`);
