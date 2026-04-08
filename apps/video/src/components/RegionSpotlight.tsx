import { interpolate } from "remotion";
import type { BoundingBox } from "../types";

interface RegionSpotlightProps {
	bbox: BoundingBox;
	prevBbox: BoundingBox | null;
	imageWidth: number;
	imageHeight: number;
	transitionProgress: number;
	overlayOpacity: number;
}

export const RegionSpotlight: React.FC<RegionSpotlightProps> = ({
	bbox,
	prevBbox,
	imageWidth,
	imageHeight,
	transitionProgress,
	overlayOpacity,
}) => {
	const source = prevBbox ?? bbox;

	const left = interpolate(
		transitionProgress,
		[0, 1],
		[(source.x / imageWidth) * 100, (bbox.x / imageWidth) * 100],
	);
	const top = interpolate(
		transitionProgress,
		[0, 1],
		[(source.y / imageHeight) * 100, (bbox.y / imageHeight) * 100],
	);
	const width = interpolate(
		transitionProgress,
		[0, 1],
		[(source.width / imageWidth) * 100, (bbox.width / imageWidth) * 100],
	);
	const height = interpolate(
		transitionProgress,
		[0, 1],
		[(source.height / imageHeight) * 100, (bbox.height / imageHeight) * 100],
	);

	return (
		<div
			style={{
				position: "absolute",
				pointerEvents: "none",
				borderRadius: 4,
				left: `${left}%`,
				top: `${top}%`,
				width: `${width}%`,
				height: `${height}%`,
				boxShadow: `0 0 0 9999px rgba(0, 0, 0, ${0.7 * overlayOpacity})`,
			}}
		/>
	);
};
