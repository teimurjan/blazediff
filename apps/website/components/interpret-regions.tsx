"use client";

import type { BoundingBox, ChangeRegion } from "@blazediff/interpret-wasm";

/** `content-change` -> `Content change`. */
export function humanize(value: string): string {
	const spaced = value.replace(/-/g, " ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function RegionHighlight({
	bbox,
	imageWidth,
	imageHeight,
}: {
	bbox: BoundingBox;
	imageWidth: number;
	imageHeight: number;
}) {
	return (
		<div
			className="absolute pointer-events-none border-2 border-white/80 rounded-sm transition-all duration-150"
			style={{
				left: `${(bbox.x / imageWidth) * 100}%`,
				top: `${(bbox.y / imageHeight) * 100}%`,
				width: `${(bbox.width / imageWidth) * 100}%`,
				height: `${(bbox.height / imageHeight) * 100}%`,
				boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
			}}
		/>
	);
}

export function RegionList({
	regions,
	hoveredIndex,
	onHover,
}: {
	regions: ChangeRegion[];
	hoveredIndex: number | null;
	onHover: (index: number | null) => void;
}) {
	return (
		<div className="space-y-2 max-h-96 overflow-y-auto">
			<p className="text-sm font-medium flex items-center gap-2 justify-between">
				<span>Regions ({regions.length})</span>
				<span className="text-gray-500">Hover a region to highlight</span>
			</p>
			{regions.map((region, i) => (
				// biome-ignore lint/a11y/noStaticElementInteractions: hover highlight
				<div
					key={`${region.position}-${i}`}
					className={`p-3 rounded-lg border text-sm cursor-pointer transition-colors ${hoveredIndex === i ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"}`}
					onMouseEnter={() => onHover(i)}
					onMouseLeave={() => onHover(null)}
				>
					<div className="flex items-center gap-2 flex-wrap">
						<span className="font-medium">{humanize(region.position)}</span>
						<span className="text-gray-500">·</span>
						<span>{humanize(region.changeType)}</span>
						<span className="text-gray-500">·</span>
						<span className="text-gray-500">{humanize(region.shape)}</span>
						<span className="text-gray-500">·</span>
						<span className="text-xs text-gray-400">
							({region.bbox.x}, {region.bbox.y}, {region.bbox.width}×
							{region.bbox.height}) · {region.percentage.toFixed(2)}%
						</span>
					</div>
				</div>
			))}
		</div>
	);
}
