import type { Dimensions, Point, TwoUpHover } from "./types";

export const DEFAULT_ZOOM_SIZE = 160;

interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Converts a pointer over a rendered image into a hover action input; null for an unlaid-out image. */
export function toTwoUpHover(
	image: 1 | 2,
	pointer: { clientX: number; clientY: number },
	rect: Rect,
): TwoUpHover | null {
	if (rect.width === 0 || rect.height === 0) return null;
	return {
		image,
		ratioX: (pointer.clientX - rect.left) / rect.width,
		ratioY: (pointer.clientY - rect.top) / rect.height,
		clientX: pointer.clientX,
		clientY: pointer.clientY,
	};
}

/** Inline style for one zoom pane: `src` magnified by `scale`, centered on `point`. */
export function zoomPaneStyle(
	src: string,
	natural: Dimensions,
	point: Point,
	scale: number,
	size: number,
): Record<string, string> {
	const offsetX = size / 2 - point.x * scale;
	const offsetY = size / 2 - point.y * scale;
	return {
		width: `${size}px`,
		height: `${size}px`,
		backgroundImage: `url(${JSON.stringify(src)})`,
		backgroundRepeat: "no-repeat",
		backgroundSize: `${natural.width * scale}px ${natural.height * scale}px`,
		backgroundPosition: `${offsetX}px ${offsetY}px`,
	};
}

function placeAxis(
	anchor: number,
	size: number,
	viewport: number,
	gap: number,
): number {
	const after = anchor + gap;
	if (after + size <= viewport) return after;
	const before = anchor - gap - size;
	return Math.max(0, Math.min(before, viewport - size));
}

/** Places a popup below-right of `anchor`, flipping per axis when it would leave the viewport. */
export function placeZoomPopup(
	anchor: Point,
	popup: Dimensions,
	viewport: Dimensions,
	gap = 16,
): Point {
	return {
		x: placeAxis(anchor.x, popup.width, viewport.width, gap),
		y: placeAxis(anchor.y, popup.height, viewport.height, gap),
	};
}
