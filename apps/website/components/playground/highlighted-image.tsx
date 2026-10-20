"use client";

import type { BoundingBox } from "@blazediff/interpret-wasm";
import { RegionHighlight } from "../interpret-regions";
import type { Size } from "./image-header";

export interface Highlight extends Size {
	bbox: BoundingBox;
}

export default function HighlightedImage({
	src,
	alt,
	highlight,
}: {
	src: string;
	alt: string;
	highlight: Highlight | null;
}) {
	return (
		// The wrapper hugs the image, so the percentage overlay lands on its pixels.
		<div className="relative overflow-hidden rounded-lg">
			{/* biome-ignore lint/performance/noImgElement: object URLs of local files cannot go through next/image */}
			<img src={src} alt={alt} className="block w-full" />
			{highlight && (
				<RegionHighlight
					bbox={highlight.bbox}
					imageWidth={highlight.width}
					imageHeight={highlight.height}
				/>
			)}
		</div>
	);
}
