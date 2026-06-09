// Shared fixtures + class props so the React and vanilla demos render identically.

const RAW =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff";

export const A = `${RAW}/1a.png`;
export const B = `${RAW}/1b.png`;

// Fixed-height, centered frame so a demo never reflows as images load or on mount.
export const FRAME =
	"my-4 flex h-80 items-center justify-center overflow-hidden rounded-lg border border-gray-200 p-4 dark:border-gray-800";

export const SWIPE = {
	className: "block max-w-md",
	containerClassName: "h-64 w-full",
	dividerClassName: "w-1 bg-blue-500",
};

export const DIFFERENCE = {
	className: "max-w-md",
	containerClassName: "flex h-64 items-center justify-center",
	canvasClassName: "max-h-full w-auto rounded-lg",
};

export const TWO_UP = {
	className: "w-full max-w-2xl",
	containerInnerClassName: "h-64 items-center justify-center gap-4",
	panelClassName: "flex h-full min-w-0 flex-1 items-center justify-center",
	imageClassName: "max-h-full w-auto max-w-full rounded-lg object-contain",
	dimensionInfoClassName:
		"flex h-6 items-center justify-center text-sm text-gray-500",
};

export const ONION_SKIN = {
	className: "w-full max-w-md",
	imageContainerClassName: "h-64 w-full",
	imageClassName: "h-full w-full rounded-lg object-contain",
	sliderContainerClassName:
		"mt-3 flex h-6 items-center justify-center gap-2 text-sm",
};
