import type { CyclingRegion } from "./use-report-cycling";

export type Bbox = CyclingRegion["bbox"];

interface RegionTileProps {
	src: string;
	alt: string;
	/** Window shown by the tile, in source-image pixels. */
	crop: Bbox;
	/** Change region outlined inside the crop, in source-image pixels. */
	bbox: Bbox;
	imageWidth: number;
	label?: string;
}

/** Expand `bbox` by `pad` on every side, clamped to the image bounds. */
export function padBbox(
	bbox: Bbox,
	pad: number,
	imageWidth: number,
	imageHeight: number,
): Bbox {
	const x = Math.max(0, bbox.x - pad);
	const y = Math.max(0, bbox.y - pad);
	return {
		x,
		y,
		width: Math.min(imageWidth, bbox.x + bbox.width + pad) - x,
		height: Math.min(imageHeight, bbox.y + bbox.height + pad) - y,
	};
}

const pct = (numerator: number, denominator: number) =>
	`${(numerator / denominator) * 100}%`;

/**
 * Crops `src` to `crop` with pure CSS: the image is scaled so the crop spans
 * the tile's width, then offset so the crop's origin sits at the tile's origin.
 */
export default function RegionTile({
	src,
	alt,
	crop,
	bbox,
	imageWidth,
	label,
}: RegionTileProps) {
	return (
		<div
			className="relative overflow-hidden bg-canvas"
			style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
		>
			{/* biome-ignore lint/performance/noImgElement: external static fixture, no Image config */}
			<img
				src={src}
				alt={alt}
				className="absolute max-w-none"
				style={{
					width: pct(imageWidth, crop.width),
					left: pct(-crop.x, crop.width),
					top: pct(-crop.y, crop.height),
				}}
			/>
			<div
				className="absolute border border-dashed border-magenta/70 pointer-events-none"
				style={{
					left: pct(bbox.x - crop.x, crop.width),
					top: pct(bbox.y - crop.y, crop.height),
					width: pct(bbox.width, crop.width),
					height: pct(bbox.height, crop.height),
				}}
			/>
			{label && (
				<span className="absolute top-1 right-1 bg-surface/90 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase text-magenta">
					{label}
				</span>
			)}
		</div>
	);
}
