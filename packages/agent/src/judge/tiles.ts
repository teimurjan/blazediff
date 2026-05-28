import path from "node:path";
import type { BoundingBox } from "@blazediff/core-native";
import sharp from "sharp";
import type { RegionSummary } from "../types";

export interface TilePrepRegion {
	bbox: BoundingBox;
	pixelCount: number;
}

export interface TilePrepResult {
	/** Diff overlay; only produced when a diff PNG is supplied. */
	locatorPath?: string;
	tilesPath?: string;
	regions: TilePrepRegion[];
}

/** One changed region cropped tight on each side, ready for the vision reader. */
export interface RegionReadCrop {
	changeType: string;
	/** Path to the upscaled baseline crop. */
	beforePath: string;
	/** Path to the upscaled actual crop. */
	afterPath: string;
}

export interface PrepareRegionReadsOptions {
	regions: RegionSummary[];
	baselinePath: string;
	actualPath: string;
	outputDir: string;
	topN?: number;
}

export interface PrepareTilesOptions {
	regions: RegionSummary[];
	baselinePath: string;
	actualPath: string;
	/** Optional: only used to render the locator overlay. Tiles never need it. */
	diffPath?: string;
	outputDir: string;
	topN?: number;
	padding?: number;
	locatorMaxWidth?: number;
	gutter?: number;
	rowGutter?: number;
}

const DEFAULT_TOP_N = 5;
// Read-crop tuning. Moondream reads small UI text reliably only when the crop is
// tight around the changed line (so both sides share the same surrounding text)
// and upscaled. Horizontal padding grabs the adjacent word(s) for context;
// vertical padding stays near the line height so neighbouring rows aren't pulled
// in. The target width drives a smooth upscale.
const READ_PAD_X_FACTOR = 2.5;
const READ_PAD_X_MIN = 48;
const READ_PAD_X_MAX = 130;
const READ_PAD_Y_FACTOR = 0.6;
const READ_PAD_Y_MIN = 4;
const READ_PAD_Y_MAX = 12;
const READ_TARGET_WIDTH = 480;
const READ_SCALE_MIN = 2;
const READ_SCALE_MAX = 6;
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

const clamp = (v: number, lo: number, hi: number): number =>
	Math.min(hi, Math.max(lo, v));

/**
 * Crop each top region tight on both baseline and actual, upscaled, for the
 * local judge to *read* (not compare). Separate from `prepareTiles`: that
 * builds the side-by-side composite the coding-agent host reads, which must stay
 * untouched; this produces per-side crops tuned for OCR-by-VLM.
 */
export async function prepareRegionReads(
	opts: PrepareRegionReadsOptions,
): Promise<RegionReadCrop[]> {
	const topN = opts.topN ?? DEFAULT_TOP_N;
	const meta = await sharp(opts.actualPath).metadata();
	const imgWidth = meta.width ?? 0;
	const imgHeight = meta.height ?? 0;
	if (!imgWidth || !imgHeight) {
		throw new Error(`unable to read image dimensions: ${opts.actualPath}`);
	}

	const ranked = [...opts.regions]
		.sort((a, b) => b.pixelCount - a.pixelCount)
		.slice(0, topN);

	return Promise.all(
		ranked.map(async (region, i) => {
			const padX = clamp(
				Math.round(region.bbox.width * READ_PAD_X_FACTOR),
				READ_PAD_X_MIN,
				READ_PAD_X_MAX,
			);
			const padY = clamp(
				Math.round(region.bbox.height * READ_PAD_Y_FACTOR),
				READ_PAD_Y_MIN,
				READ_PAD_Y_MAX,
			);
			const left = Math.max(0, Math.floor(region.bbox.x - padX));
			const top = Math.max(0, Math.floor(region.bbox.y - padY));
			const right = Math.min(
				imgWidth,
				Math.ceil(region.bbox.x + region.bbox.width + padX),
			);
			const bottom = Math.min(
				imgHeight,
				Math.ceil(region.bbox.y + region.bbox.height + padY),
			);
			const extract = {
				left,
				top,
				width: Math.max(1, right - left),
				height: Math.max(1, bottom - top),
			};
			const scale = clamp(
				Math.round(READ_TARGET_WIDTH / extract.width),
				READ_SCALE_MIN,
				READ_SCALE_MAX,
			);

			const render = async (src: string, suffix: string): Promise<string> => {
				const name = `read-${i}.${suffix}.png`;
				await sharp(src)
					.extract(extract)
					.resize(extract.width * scale, extract.height * scale, {
						kernel: "lanczos3",
					})
					.png()
					.toFile(path.join(opts.outputDir, name));
				return path.join(opts.outputDir, name);
			};

			const [beforePath, afterPath] = await Promise.all([
				render(opts.baselinePath, "before"),
				render(opts.actualPath, "after"),
			]);
			return { changeType: region.changeType, beforePath, afterPath };
		}),
	);
}

export async function prepareTiles(
	opts: PrepareTilesOptions,
): Promise<TilePrepResult> {
	const topN = opts.topN ?? DEFAULT_TOP_N;
	const padding = opts.padding ?? DEFAULT_PADDING;
	const locatorMaxWidth = opts.locatorMaxWidth ?? DEFAULT_LOCATOR_MAX_WIDTH;
	const gutter = opts.gutter ?? DEFAULT_GUTTER;
	const rowGutter = opts.rowGutter ?? DEFAULT_ROW_GUTTER;

	// Dimensions come from the actual screenshot (always present); the diff PNG
	// is optional and only feeds the locator overlay below.
	const meta = await sharp(opts.actualPath).metadata();
	const imgWidth = meta.width ?? 0;
	const imgHeight = meta.height ?? 0;
	if (!imgWidth || !imgHeight) {
		throw new Error(`unable to read image dimensions: ${opts.actualPath}`);
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
			const [base, actual] = await Promise.all([
				sharp(opts.baselinePath).extract(extract).toBuffer(),
				sharp(opts.actualPath).extract(extract).toBuffer(),
			]);
			return { region, padded, base, actual };
		}),
	);

	let tilesName: string | undefined;
	if (regionData.length > 0) {
		const canvasWidth = Math.max(
			...regionData.map((r) => r.padded.width * 2 + gutter),
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

	// The locator overlays the changed regions on the diff image. It is purely a
	// human/host aid, so skip it when no diff PNG is available.
	let locatorName: string | undefined;
	if (opts.diffPath) {
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

		locatorName = "locator.png";
		await sharp(opts.diffPath)
			.resize(locW, locH, { fit: "fill" })
			.composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
			.png()
			.toFile(path.join(opts.outputDir, locatorName));
	}

	return {
		locatorPath: locatorName,
		tilesPath: tilesName,
		regions: regionData.map((r) => ({
			bbox: r.region.bbox,
			pixelCount: r.region.pixelCount,
		})),
	};
}
