import path from "node:path";
import type { BoundingBox, ChangeRegion } from "@blazediff/core-native";
import sharp from "sharp";

export interface TilePrepRegion {
	bbox: BoundingBox;
	pixelCount: number;
}

export interface TilePrepResult {
	locatorPath: string;
	tilesPath?: string;
	regions: TilePrepRegion[];
}

export interface PrepareTilesOptions {
	regions: ChangeRegion[];
	baselinePath: string;
	actualPath: string;
	diffPath: string;
	outputDir: string;
	topN?: number;
	padding?: number;
	locatorMaxWidth?: number;
	gutter?: number;
	rowGutter?: number;
}

const DEFAULT_TOP_N = 5;
const DEFAULT_PADDING = 16;
const DEFAULT_LOCATOR_MAX_WIDTH = 400;
const DEFAULT_GUTTER = 2;
const DEFAULT_ROW_GUTTER = 8;
const BG_WHITE = { r: 255, g: 255, b: 255 };

function padAndClamp(
	bbox: BoundingBox,
	padding: number,
	imgWidth: number,
	imgHeight: number,
): BoundingBox {
	const left = Math.max(0, Math.floor(bbox.x - padding));
	const top = Math.max(0, Math.floor(bbox.y - padding));
	const right = Math.min(imgWidth, Math.ceil(bbox.x + bbox.width + padding));
	const bottom = Math.min(imgHeight, Math.ceil(bbox.y + bbox.height + padding));
	return {
		x: left,
		y: top,
		width: Math.max(1, right - left),
		height: Math.max(1, bottom - top),
	};
}

export async function prepareTiles(
	opts: PrepareTilesOptions,
): Promise<TilePrepResult> {
	const topN = opts.topN ?? DEFAULT_TOP_N;
	const padding = opts.padding ?? DEFAULT_PADDING;
	const locatorMaxWidth = opts.locatorMaxWidth ?? DEFAULT_LOCATOR_MAX_WIDTH;
	const gutter = opts.gutter ?? DEFAULT_GUTTER;
	const rowGutter = opts.rowGutter ?? DEFAULT_ROW_GUTTER;

	const diffMeta = await sharp(opts.diffPath).metadata();
	const imgWidth = diffMeta.width ?? 0;
	const imgHeight = diffMeta.height ?? 0;
	if (!imgWidth || !imgHeight) {
		throw new Error(`unable to read diff image dimensions: ${opts.diffPath}`);
	}

	const ranked = [...opts.regions]
		.sort((a, b) => b.pixelCount - a.pixelCount)
		.slice(0, topN);

	const regionData = await Promise.all(
		ranked.map(async (region) => {
			const padded = padAndClamp(region.bbox, padding, imgWidth, imgHeight);
			const extract = {
				left: padded.x,
				top: padded.y,
				width: padded.width,
				height: padded.height,
			};
			const [base, actual, diff] = await Promise.all([
				sharp(opts.baselinePath).extract(extract).toBuffer(),
				sharp(opts.actualPath).extract(extract).toBuffer(),
				sharp(opts.diffPath).extract(extract).toBuffer(),
			]);
			return { region, padded, base, actual, diff };
		}),
	);

	let tilesName: string | undefined;
	if (regionData.length > 0) {
		const canvasWidth = Math.max(
			...regionData.map((r) => r.padded.width * 3 + gutter * 2),
		);
		const totalHeight = regionData.reduce(
			(sum, r, i) => sum + r.padded.height + (i > 0 ? rowGutter : 0),
			0,
		);

		const composites: sharp.OverlayOptions[] = [];
		let y = 0;
		for (let i = 0; i < regionData.length; i++) {
			const r = regionData[i];
			const w = r.padded.width;
			composites.push(
				{ input: r.base, left: 0, top: y },
				{ input: r.actual, left: w + gutter, top: y },
				{ input: r.diff, left: 2 * (w + gutter), top: y },
			);
			y += r.padded.height;
			if (i < regionData.length - 1) y += rowGutter;
		}

		tilesName = "regions.png";
		await sharp({
			create: {
				width: canvasWidth,
				height: totalHeight,
				channels: 3,
				background: BG_WHITE,
			},
		})
			.composite(composites)
			.png()
			.toFile(path.join(opts.outputDir, tilesName));
	}

	const scale = locatorMaxWidth / Math.max(imgWidth, imgHeight);
	const locW = Math.max(1, Math.round(imgWidth * scale));
	const locH = Math.max(1, Math.round(imgHeight * scale));

	const rects = opts.regions
		.map((r) => {
			const x = Math.round(r.bbox.x * scale);
			const y = Math.round(r.bbox.y * scale);
			const w = Math.max(1, Math.round(r.bbox.width * scale));
			const h = Math.max(1, Math.round(r.bbox.height * scale));
			return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="red" stroke-width="2" />`;
		})
		.join("");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${locW}" height="${locH}">${rects}</svg>`;

	const locatorName = "locator.png";
	await sharp(opts.diffPath)
		.resize(locW, locH, { fit: "fill" })
		.composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
		.png()
		.toFile(path.join(opts.outputDir, locatorName));

	return {
		locatorPath: locatorName,
		tilesPath: tilesName,
		regions: regionData.map((r) => ({
			bbox: r.region.bbox,
			pixelCount: r.region.pixelCount,
		})),
	};
}
